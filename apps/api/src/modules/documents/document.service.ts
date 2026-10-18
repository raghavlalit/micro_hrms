import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, IsNull } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { Tenant } from '../tenants/tenant.schemas';
import { companyToday } from '../holidays/holiday-calendar';
import {
  DocumentCategory,
  DocumentVersion,
  EmployeeDocument,
} from './document.schemas';
import { DocumentAccess } from './document-access.service';
import { DocumentStorage } from './document-storage.service';
import {
  DocumentActionDto,
  DocumentCreateDto,
  DocumentListDto,
  DocumentMetadataDto,
  DocumentUpdateDto,
  DocumentUploadDto,
} from './document.dto';
import { DocumentUploadFile, validateDocumentFile } from './document-file';

@Injectable()
export class DocumentService {
  constructor(
    readonly access: DocumentAccess,
    readonly storage: DocumentStorage,
  ) {}
  async metadata(
    manager: EntityManager,
    actor: Principal,
    dto: DocumentMetadataDto,
  ) {
    if (dto.issue_date && dto.expiry_date && dto.expiry_date < dto.issue_date)
      throw new BadRequestException('Expiry date cannot precede issue date');
    if (
      !(await manager.getRepository(DocumentCategory).existsBy({
        tenant_id: actor.tenantId,
        id: dto.category_id,
        archived_at: IsNull(),
      }))
    )
      throw new BadRequestException(
        'Choose an active category from your company',
      );
    return {
      category_id: dto.category_id,
      title: dto.title,
      visibility: dto.visibility,
      issue_date: dto.issue_date || null,
      expiry_date: dto.expiry_date || null,
    };
  }
  async quota(manager: EntityManager, actor: Principal, bytes: number) {
    // Archived versions remain stored and count toward the same tenant quota.
    const result = await manager
      .getRepository(DocumentVersion)
      .createQueryBuilder('version')
      .select('COALESCE(SUM(version.size_bytes),0)', 'total')
      .where('version.tenant_id = :tenantId', { tenantId: actor.tenantId })
      .getRawOne<{ total: string }>();
    const maximum = process.env.DOCUMENT_TENANT_QUOTA_BYTES || '1073741824';
    if (!/^\d+$/.test(maximum) || BigInt(maximum) < 1n)
      throw new Error('Invalid DOCUMENT_TENANT_QUOTA_BYTES');
    if (BigInt(result!.total) + BigInt(bytes) > BigInt(maximum))
      throw new ConflictException(
        'Company document storage quota exceeded. Contact your administrator.',
      );
  }
  async insertVersion(
    manager: EntityManager,
    actor: Principal,
    documentId: string,
    version: number,
    id: string,
    file: ReturnType<typeof validateDocumentFile>,
  ) {
    await this.quota(manager, actor, file.bytes.length);
    // Random object keys permit a safe retry after a DB rollback without overwriting history.
    const key = `${actor.tenantId}/${documentId}/${randomUUID()}`;
    await this.storage.save(key, file.bytes, file.mime);
    await manager.getRepository(DocumentVersion).insert({
      id,
      tenant_id: actor.tenantId,
      document_id: documentId,
      version,
      object_key: key,
      original_filename: file.filename,
      mime_type: file.mime,
      size_bytes: String(file.bytes.length),
      checksum: file.checksum,
      uploaded_by: actor.id,
    });
  }
  create(
    actor: Principal,
    dto: DocumentCreateDto,
    upload?: DocumentUploadFile,
  ) {
    const file = validateDocumentFile(upload);
    return this.access.write(actor, async (manager) => {
      const metadata = await this.metadata(manager, actor, dto);
      const prior = await manager
        .getRepository(EmployeeDocument)
        .findOneBy({ tenant_id: actor.tenantId, id: dto.operation_id });
      if (prior) {
        const first = await manager.getRepository(DocumentVersion).findOneBy({
          tenant_id: actor.tenantId,
          document_id: dto.operation_id,
          version: 1,
        });
        if (
          prior.employee_id !== dto.employee_id ||
          first?.checksum !== file.checksum ||
          first?.original_filename !== file.filename ||
          Object.entries(metadata).some(([key, value]) => prior[key] !== value)
        )
          throw new ConflictException(
            'Operation ID already belongs to a different upload',
          );
        return { id: prior.id, replayed: true };
      }
      if (
        !(await this.access.employees.assignable(
          manager,
          actor.tenantId!,
          dto.employee_id,
        ))
      )
        throw new NotFoundException('Employee not found');
      await manager.getRepository(EmployeeDocument).insert({
        id: dto.operation_id,
        tenant_id: actor.tenantId,
        employee_id: dto.employee_id,
        ...metadata,
      });
      await this.insertVersion(
        manager,
        actor,
        dto.operation_id,
        1,
        randomUUID(),
        file,
      );
      await this.access.audit(manager, actor, dto.operation_id, 'uploaded', {
        version: 1,
        employee_id: dto.employee_id,
        visibility: dto.visibility,
        reason: dto.reason,
      });
      return { id: dto.operation_id };
    });
  }
  addVersion(
    actor: Principal,
    id: string,
    dto: DocumentUploadDto,
    upload?: DocumentUploadFile,
  ) {
    const file = validateDocumentFile(upload);
    return this.access.write(actor, async (manager) => {
      const record = await this.access.record(manager, actor, id);
      const prior = await manager
        .getRepository(DocumentVersion)
        .findOneBy({ tenant_id: actor.tenantId, id: dto.operation_id });
      if (prior) {
        if (
          prior.document_id !== id ||
          prior.checksum !== file.checksum ||
          prior.original_filename !== file.filename
        )
          throw new ConflictException(
            'Operation ID already belongs to a different upload',
          );
        return { id: prior.id, version: prior.version, replayed: true };
      }
      this.access.current(record, dto.revision);
      const last = await manager.getRepository(DocumentVersion).findOne({
        where: { tenant_id: actor.tenantId, document_id: id },
        order: { version: 'DESC' },
      });
      const version = Number(last?.version || 0) + 1;
      await this.insertVersion(
        manager,
        actor,
        id,
        version,
        dto.operation_id,
        file,
      );
      await manager
        .getRepository(EmployeeDocument)
        .update({ tenant_id: actor.tenantId, id }, { revision: randomUUID() });
      await this.access.audit(manager, actor, id, 'version_uploaded', {
        version,
        reason: dto.reason,
      });
      return { id: dto.operation_id, version };
    });
  }
  update(actor: Principal, id: string, dto: DocumentUpdateDto) {
    return this.access.write(actor, async (manager) => {
      const record = await this.access.record(manager, actor, id);
      this.access.current(record, dto.revision);
      const metadata = await this.metadata(manager, actor, dto);
      await manager
        .getRepository(EmployeeDocument)
        .update(
          { tenant_id: actor.tenantId, id },
          { ...metadata, revision: randomUUID() },
        );
      await this.access.audit(manager, actor, id, 'metadata_updated', {
        before_visibility: record.visibility,
        visibility: dto.visibility,
        reason: dto.reason,
      });
      return { id };
    });
  }
  archive(
    actor: Principal,
    id: string,
    dto: DocumentActionDto,
    versionId?: string,
  ) {
    return this.access.write(actor, async (manager) => {
      const record = await this.access.record(manager, actor, id);
      this.access.current(record, dto.revision, true);
      if (versionId) {
        const repository = manager.getRepository(DocumentVersion);
        const version = await repository.findOneBy({
          tenant_id: actor.tenantId,
          document_id: id,
          id: versionId,
        });
        if (!version) throw new NotFoundException('Document version not found');
        if (version.archived_at)
          throw new ConflictException('Version is already archived');
        if (
          !record.archived_at &&
          (await repository.countBy({
            tenant_id: actor.tenantId,
            document_id: id,
            archived_at: IsNull(),
          })) <= 1
        )
          throw new ConflictException(
            'Archive the document before archiving its last available version',
          );
        await repository.update(
          { tenant_id: actor.tenantId, id: versionId },
          { archived_at: new Date() },
        );
      } else if (record.archived_at)
        throw new ConflictException('Document is already archived');
      await manager.getRepository(EmployeeDocument).update(
        { tenant_id: actor.tenantId, id },
        {
          revision: randomUUID(),
          ...(!versionId ? { archived_at: new Date() } : {}),
        },
      );
      await this.access.audit(
        manager,
        actor,
        id,
        versionId ? 'version_archived' : 'archived',
        { version_id: versionId || null, reason: dto.reason },
      );
      return { id };
    });
  }
  list(actor: Principal, dto: DocumentListDto) {
    return this.access.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = await this.access.query(manager, actor);
      if (dto.status === 'active')
        query.andWhere('document.archived_at IS NULL');
      if (dto.status === 'archived')
        query.andWhere('document.archived_at IS NOT NULL');
      if (dto.employee_id)
        query.andWhere('document.employee_id = :employeeId', {
          employeeId: dto.employee_id,
        });
      if (dto.category_id)
        query.andWhere('document.category_id = :categoryId', {
          categoryId: dto.category_id,
        });
      if (dto.search)
        query.andWhere(
          '(document.title ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.employee_code ILIKE :search)',
          { search: `%${dto.search.replace(/[\\%_]/g, '\\$&')}%` },
        );
      const tenant = await manager
        .getRepository(Tenant)
        .findOneByOrFail({ id: actor.tenantId });
      const today = companyToday(String(tenant.timezone)),
        end = new Date(today + 'T00:00:00Z');
      end.setUTCDate(end.getUTCDate() + 30);
      if (dto.expiry === 'expired')
        query.andWhere('document.expiry_date < :today', { today });
      if (dto.expiry === 'expiring')
        query.andWhere(
          'document.expiry_date >= :today AND document.expiry_date <= :end',
          { today, end: end.toISOString().slice(0, 10) },
        );
      const total = await query.getCount();
      const items = await query
        .innerJoin(
          DocumentCategory.options.name,
          'category',
          'category.id = document.category_id AND category.tenant_id = document.tenant_id',
        )
        .select([
          'document.id AS id',
          'document.title AS title',
          'document.employee_id AS employee_id',
          'employee.employee_code AS employee_code',
          "concat(employee.first_name, ' ', employee.last_name) AS employee_name",
          'category.name AS category_name',
          'document.visibility AS visibility',
          'document.expiry_date::text AS expiry_date',
          'document.archived_at AS archived_at',
        ])
        .orderBy('document.created_at', 'DESC')
        .addOrderBy('document.id', 'ASC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany();
      return { items, total, today };
    });
  }
  detail(actor: Principal, id: string) {
    return this.access.tenants.withTenant(actor.tenantId!, async (manager) => {
      const record = await this.access.record(manager, actor, id);
      const employee = await this.access.employees.one(
        manager,
        actor.tenantId!,
        String(record.employee_id),
      );
      if (!employee) throw new NotFoundException('Employee not found');
      const category = await manager
        .getRepository(DocumentCategory)
        .findOneByOrFail({
          tenant_id: actor.tenantId,
          id: String(record.category_id),
        });
      const rows = await manager.getRepository(DocumentVersion).find({
        where: {
          tenant_id: actor.tenantId,
          document_id: id,
          ...(!this.access.manages(actor) ? { archived_at: IsNull() } : {}),
        },
        order: { version: 'DESC' },
      });
      return {
        ...record,
        employee_name: employee.name,
        employee_code: employee.employee_code,
        category_name: category.name,
        versions: rows.map(
          ({
            id,
            version,
            original_filename,
            mime_type,
            size_bytes,
            checksum,
            created_at,
            archived_at,
          }) => ({
            id,
            version,
            original_filename,
            mime_type,
            size_bytes,
            checksum,
            created_at,
            archived_at,
          }),
        ),
      };
    });
  }
  download(actor: Principal, id: string, versionId: string) {
    return this.access.tenants.withTenant(actor.tenantId!, async (manager) => {
      await this.access.record(manager, actor, id);
      const version = await manager.getRepository(DocumentVersion).findOneBy({
        tenant_id: actor.tenantId,
        document_id: id,
        id: versionId,
        ...(!this.access.manages(actor) ? { archived_at: IsNull() } : {}),
      });
      if (!version) throw new NotFoundException('Document version not found');
      const bytes = await this.storage.read(
        String(version.object_key),
        String(version.checksum),
      );
      await this.access.audit(manager, actor, id, 'downloaded', {
        version_id: versionId,
      });
      const extension =
        version.mime_type === 'application/pdf'
          ? 'pdf'
          : version.mime_type === 'image/png'
            ? 'png'
            : 'jpg';
      return {
        bytes,
        mime: String(version.mime_type),
        filename: `document-${id}-v${String(version.version)}.${extension}`,
      };
    });
  }
  people(actor: Principal, dto: DocumentListDto) {
    this.access.requireManage(actor);
    return this.access.tenants.withTenant(actor.tenantId!, (manager) =>
      this.access.employees.people(
        manager,
        actor.tenantId!,
        dto.search,
        dto.page,
        dto.limit,
      ),
    );
  }
}

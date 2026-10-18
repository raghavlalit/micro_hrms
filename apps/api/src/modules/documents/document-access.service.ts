import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Brackets, EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Tenant } from '../tenants/tenant.schemas';
import { EmployeeDocumentService } from '../employees/employee-document.service';
import { AuditLog } from '../audit/audit.schemas';
import { EmployeeDocument } from './document.schemas';
@Injectable()
export class DocumentAccess {
  constructor(
    readonly tenants: TenantDatabaseService,
    readonly employees: EmployeeDocumentService,
  ) {}
  manages(actor: Principal) {
    return actor.permissions.includes('documents.manage');
  }
  requireManage(actor: Principal) {
    if (!this.manages(actor))
      throw new ForbiddenException('Document management permission required');
  }
  async query(manager: EntityManager, actor: Principal) {
    const query = manager
      .getRepository(EmployeeDocument)
      .createQueryBuilder('document')
      .innerJoin(
        // Deliberate read model: join only the fields needed to scope document access.
        'employees',
        'employee',
        'employee.id = document.employee_id AND employee.tenant_id = document.tenant_id',
      )
      .where('document.tenant_id = :tenantId', { tenantId: actor.tenantId });
    if (this.manages(actor)) return query;
    const own = actor.permissions.includes('documents.read.self'),
      team = actor.permissions.includes('documents.read.team');
    if (!own && !team)
      throw new ForbiddenException('Document access permission required');
    const self = await this.employees.linked(
      manager,
      actor.tenantId!,
      actor.id,
    );
    query.andWhere('document.archived_at IS NULL');
    query.andWhere(
      new Brackets((scope) => {
        scope.where('1 = 0');
        if (own)
          scope.orWhere(
            "employee.user_id = :userId AND document.visibility IN ('employee','team')",
            { userId: actor.id },
          );
        if (team && self)
          scope.orWhere(
            "employee.manager_id = :managerId AND document.visibility = 'team'",
            { managerId: self.id },
          );
      }),
    );
    return query;
  }
  async record(manager: EntityManager, actor: Principal, id: string) {
    const record = await (
      await this.query(manager, actor)
    )
      .andWhere('document.id = :id', { id })
      .getOne();
    if (!record) throw new NotFoundException('Document not found');
    return record;
  }
  current(
    record: Record<string, unknown>,
    revision: string,
    allowArchived = false,
  ) {
    if (record.revision !== revision)
      throw new ConflictException(
        'Document changed. Refresh before continuing.',
      );
    if (record.archived_at && !allowArchived)
      throw new ConflictException('Archived documents cannot be changed');
  }
  write<T>(actor: Principal, work: (manager: EntityManager) => Promise<T>) {
    this.requireManage(actor);
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      await manager
        .getRepository(Tenant)
        .createQueryBuilder('tenant')
        .where('tenant.id = :id', { id: actor.tenantId })
        .setLock('pessimistic_write')
        .getOneOrFail();
      return work(manager);
    });
  }
  audit(
    manager: EntityManager,
    actor: Principal,
    id: string,
    action: string,
    metadata: object,
  ) {
    return manager.getRepository(AuditLog).insert({
      tenant_id: actor.tenantId,
      actor_id: actor.id,
      entity_type: 'document',
      entity_id: id,
      action: `document.${action}`,
      metadata,
    });
  }
}

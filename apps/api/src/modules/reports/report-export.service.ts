import {
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { BackgroundIdentity } from '../auth/background-identity.service';
import {
  BackgroundJob,
  JobRecord,
} from '../background-jobs/background-job.schemas';
import {
  BackgroundJobs,
  publicJob,
  requestHash,
} from '../background-jobs/background-jobs.service';
import { AuditLog } from '../audit/audit.schemas';
import { ReportsService } from './reports.service';
import { ReportKind, ReportQueryDto } from './report.dto';
import { ExportListDto, ReportExportDto } from './report-export.dto';
import { ReportExportStorage } from './report-export-storage.service';
import { reportCsv } from './report-csv';

@Injectable()
export class ReportExports {
  constructor(
    readonly jobs: BackgroundJobs,
    readonly reports: ReportsService,
    readonly identities: BackgroundIdentity,
    readonly storage: ReportExportStorage,
  ) {}
  async enqueue(actor: Principal, kind: ReportKind, dto: ReportExportDto) {
    const { operation_id, page: _, limit: __, ...input } = dto;
    const options = await this.reports.options(actor, kind);
    const filters = this.reports.filters(
      kind,
      input as ReportQueryDto,
      options.today,
    );
    return this.jobs.write(actor, async (manager) => {
      const current = await this.identities.resolve(
        manager,
        actor.tenantId!,
        actor.id,
      );
      const scope = await this.reports.access.resolve(manager, current, kind);
      // Validate the selected run directly; the options list is only a recent-run shortcut.
      if (kind === 'payroll' || kind === 'components')
        await this.reports.model.query(
          manager,
          current,
          scope,
          kind,
          filters as ReportQueryDto,
        );
      const queued = await this.jobs.enqueue(
        manager,
        current,
        'report_export',
        `${actor.id}/${operation_id}`,
        requestHash({ kind, ...input }),
        { kind, filters, today: options.today },
      );
      if (queued.created)
        await this.audit(manager, actor, queued.job.id, 'export_queued', {
          kind,
        });
      return publicJob(queued.job);
    });
  }
  async owned(
    manager: EntityManager,
    actor: Principal,
    id: string,
    lock = false,
  ) {
    const job = await this.jobs.get(manager, actor.tenantId!, id, lock);
    if (job.kind !== 'report_export' || job.requested_by !== actor.id)
      throw new NotFoundException('Export not found');
    return job;
  }
  list(actor: Principal, dto: ExportListDto) {
    return this.jobs.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = manager
        .getRepository(BackgroundJob)
        .createQueryBuilder('job')
        .where(
          'job.tenant_id=:tenantId AND job.requested_by=:userId AND job.kind=:kind',
          { tenantId: actor.tenantId, userId: actor.id, kind: 'report_export' },
        );
      const total = await query.getCount();
      const items = await query
        .orderBy('job.created_at', 'DESC')
        .addOrderBy('job.id', 'DESC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getMany();
      return {
        items: items.map((row) => publicJob(row as unknown as JobRecord)),
        total,
      };
    });
  }
  status(actor: Principal, id: string) {
    return this.jobs.tenants.withTenant(actor.tenantId!, async (manager) =>
      publicJob(await this.owned(manager, actor, id)),
    );
  }
  retry(actor: Principal, id: string) {
    return this.jobs.write(actor, async (manager) => {
      const job = await this.owned(manager, actor, id, true);
      const current = await this.identities.resolve(
        manager,
        actor.tenantId!,
        actor.id,
      );
      await this.reports.access.resolve(
        manager,
        current,
        this.reports.kind(String(job.payload.kind)),
      );
      const result = await this.jobs.retry(manager, job, actor.id);
      await this.audit(manager, actor, id, 'export_retried');
      return publicJob(result);
    });
  }
  // A saved team report must not remain downloadable after its employees move
  // outside the requester's scope. Compare the actual exported employee IDs.
  private async checkScope(
    manager: EntityManager,
    actor: Principal,
    kind: ReportKind,
    employeeIds: string[],
  ) {
    const current = await this.identities.resolve(
      manager,
      actor.tenantId!,
      actor.id,
    );
    const scope = await this.reports.access.resolve(manager, current, kind);
    if (scope.level !== 'company') {
      for (let index = 0; index < employeeIds.length; index += 1000) {
        const batch = employeeIds.slice(index, index + 1000);
        const count = await this.reports.model
          .employees(manager, current, scope)
          .andWhere('employee.id IN (:...ids)', { ids: batch })
          .getCount();
        if (count !== batch.length)
          throw new ForbiddenException(
            'Report access changed; request a new export',
          );
      }
    }
  }
  async generate(job: JobRecord) {
    const actor = await this.jobs.tenants.withTenant(job.tenant_id, (manager) =>
      this.identities.resolve(manager, job.tenant_id, job.requested_by),
    );
    const kind = this.reports.kind(String(job.payload.kind));
    const data = await this.reports.backgroundData(
      actor,
      kind,
      job.payload.filters as ReportQueryDto,
    );
    await this.jobs.progress(job, data.total, data.total);
    const key = `${job.tenant_id}/${job.id}/${job.lease_token}.csv`;
    let committed = false;
    try {
      await this.storage.save(key, reportCsv(data.columns, data.rows));
      await this.jobs.tenants.withTenant(job.tenant_id, async (manager) => {
        await this.jobs.assertLease(manager, job);
        await this.checkScope(manager, actor, kind, data.employee_ids);
        await this.jobs.complete(
          manager,
          job,
          {
            object_key: key,
            filename: `${kind}-${String(job.payload.today)}.csv`,
            employee_ids: data.employee_ids,
            rows: data.total,
          },
          data.total,
          true,
        );
        await this.audit(manager, actor, job.id, 'export_completed', {
          kind,
          rows: data.total,
        });
      });
      committed = true;
    } finally {
      if (!committed) await this.storage.remove(key).catch(() => undefined);
    }
  }
  async download(actor: Principal, id: string) {
    return this.jobs.tenants.withTenant(actor.tenantId!, async (manager) => {
      const job = await this.owned(manager, actor, id, true);
      if (
        job.status === 'expired' ||
        (job.expires_at && new Date(job.expires_at).getTime() <= Date.now())
      )
        throw new GoneException('Export expired; request a new one');
      if (job.status !== 'completed')
        throw new ConflictException('Export is not ready');
      await this.checkScope(
        manager,
        actor,
        this.reports.kind(String(job.payload.kind)),
        job.result.employee_ids as string[],
      );
      const bytes = await this.storage.read(String(job.result.object_key));
      await this.audit(manager, actor, id, 'export_downloaded');
      return { bytes, filename: String(job.result.filename) };
    });
  }
  expire(tenantId: string, id: string) {
    return this.jobs.tenants.withTenant(tenantId, async (manager) => {
      const job = await this.jobs.get(manager, tenantId, id, true);
      if (
        job.kind !== 'report_export' ||
        job.status !== 'completed' ||
        !job.expires_at ||
        new Date(job.expires_at).getTime() > Date.now()
      )
        return;
      await this.storage.remove(String(job.result.object_key));
      await manager
        .getRepository(BackgroundJob)
        .update({ tenant_id: tenantId, id }, { status: 'expired', result: {} });
    });
  }
  private audit(
    manager: EntityManager,
    actor: Principal,
    id: string,
    action: string,
    metadata: object = {},
  ) {
    return manager
      .getRepository(AuditLog)
      .insert({
        tenant_id: actor.tenantId,
        actor_id: actor.id,
        entity_type: 'report_export',
        entity_id: id,
        action: `report.${action}`,
        metadata,
      });
  }
}

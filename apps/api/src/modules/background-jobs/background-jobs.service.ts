import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { EntityManager, In } from 'typeorm';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Tenant } from '../tenants/tenant.schemas';
import type { Principal } from '../auth/auth.service';
import { BackgroundJob, JobRecord } from './background-job.schemas';

export function requestHash(value: Record<string, unknown>) {
  return createHash('sha256')
    .update(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
        ),
      ),
    )
    .digest('hex');
}
export function publicJob(job: JobRecord) {
  return {
    id: job.id,
    kind: job.kind,
    resource_id: job.resource_id,
    status:
      job.status === 'completed' &&
      job.expires_at &&
      new Date(job.expires_at).getTime() <= Date.now()
        ? 'expired'
        : job.status,
    attempts: job.attempts,
    completed_units: job.completed_units,
    total_units: job.total_units,
    error_code: job.error_code,
    created_at: job.created_at,
    completed_at: job.completed_at,
    expires_at: job.expires_at,
    report_type: job.kind === 'report_export' ? job.payload.kind : undefined,
  };
}
@Injectable()
export class BackgroundJobs {
  constructor(readonly tenants: TenantDatabaseService) {}
  write<T>(actor: Principal, work: (manager: EntityManager) => Promise<T>) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      await manager
        .getRepository(Tenant)
        .createQueryBuilder('tenant')
        .where('tenant.id=:id', { id: actor.tenantId })
        .setLock('pessimistic_write')
        .getOneOrFail();
      return work(manager);
    });
  }
  async get(
    manager: EntityManager,
    tenantId: string,
    id: string,
    lock = false,
  ) {
    const query = manager
      .getRepository(BackgroundJob)
      .createQueryBuilder('job')
      .where('job.tenant_id=:tenantId AND job.id=:id', { tenantId, id });
    if (lock) query.setLock('pessimistic_write');
    const row = await query.getOne();
    if (!row) throw new NotFoundException('Job not found');
    return row as unknown as JobRecord;
  }
  async enqueue(
    manager: EntityManager,
    actor: Principal,
    kind: JobRecord['kind'],
    key: string,
    hash: string,
    payload: Record<string, unknown>,
    resourceId: string | null = null,
  ) {
    const repository = manager.getRepository(BackgroundJob);
    const existing = await repository.findOneBy({
      tenant_id: actor.tenantId,
      kind,
      request_key: key,
    });
    if (existing) {
      if (existing.request_hash !== hash)
        throw new ConflictException(
          'Operation ID already used with different filters',
        );
      return { job: existing as unknown as JobRecord, created: false };
    }
    if (
      (await repository.countBy({
        tenant_id: actor.tenantId,
        requested_by: actor.id,
        status: In(['pending', 'running']),
      })) >= 3
    )
      throw new ConflictException(
        'Wait for an existing background job to finish before requesting another',
      );
    const id = randomUUID();
    await repository.insert({
      id,
      tenant_id: actor.tenantId,
      requested_by: actor.id,
      kind,
      request_key: key,
      request_hash: hash,
      payload,
      resource_id: resourceId,
    });
    return { job: await this.get(manager, actor.tenantId!, id), created: true };
  }
  async retry(manager: EntityManager, job: JobRecord, actorId: string) {
    if (job.status !== 'failed')
      throw new ConflictException('Only failed jobs can be retried');
    if (
      (await manager
        .getRepository(BackgroundJob)
        .countBy({
          tenant_id: job.tenant_id,
          requested_by: actorId,
          status: In(['pending', 'running']),
        })) >= 3
    )
      throw new ConflictException(
        'Wait for an existing background job to finish before retrying',
      );
    await manager.getRepository(BackgroundJob).update(
      { tenant_id: job.tenant_id, id: job.id },
      {
        requested_by: actorId,
        status: 'pending',
        attempts: 0,
        completed_units: 0,
        total_units: 0,
        available_at: () => 'now()',
        lease_token: null,
        error_code: null,
        completed_at: null,
        result: {},
      },
    );
    return this.get(manager, job.tenant_id, job.id);
  }
  claim(tenantId: string, id: string) {
    return this.tenants.withTenant(tenantId, async (manager) => {
      const job = await this.get(manager, tenantId, id, true);
      if (
        !['pending', 'running'].includes(job.status) ||
        new Date(job.available_at).getTime() > Date.now()
      )
        return null;
      if (job.attempts >= 3) {
        await manager
          .getRepository(BackgroundJob)
          .update(
            { id, tenant_id: tenantId },
            {
              status: 'failed',
              error_code: 'WORKER_INTERRUPTED',
              completed_at: () => 'now()',
              lease_token: null,
            },
          );
        return null;
      }
      await manager.getRepository(BackgroundJob).update(
        { id, tenant_id: tenantId },
        {
          status: 'running',
          attempts: job.attempts + 1,
          lease_token: randomUUID(),
          started_at: () => 'now()',
          error_code: null,
          available_at: () => "now() + interval '2 minutes'",
          completed_units: 0,
        },
      );
      return this.get(manager, tenantId, id);
    });
  }
  async assertLease(manager: EntityManager, job: JobRecord) {
    const valid = await manager
      .getRepository(BackgroundJob)
      .createQueryBuilder('job')
      .where(
        "job.id=:id AND job.tenant_id=:tenantId AND job.status='running' AND job.lease_token=:lease AND job.available_at>now()",
        { id: job.id, tenantId: job.tenant_id, lease: job.lease_token },
      )
      .setLock('pessimistic_write')
      .getOne();
    if (!valid) throw new ConflictException('Job lease changed');
  }
  progress(job: JobRecord, completed?: number, total?: number) {
    return this.tenants.withTenant(job.tenant_id, async (manager) => {
      const result = await manager.getRepository(BackgroundJob).update(
        {
          id: job.id,
          tenant_id: job.tenant_id,
          status: 'running',
          lease_token: job.lease_token!,
        },
        {
          available_at: () => "now() + interval '2 minutes'",
          ...(completed === undefined ? {} : { completed_units: completed }),
          ...(total === undefined ? {} : { total_units: total }),
        },
      );
      if (!result.affected) throw new ConflictException('Job lease changed');
    });
  }
  async complete(
    manager: EntityManager,
    job: JobRecord,
    result: Record<string, unknown>,
    total: number,
    expires = false,
  ) {
    await this.assertLease(manager, job);
    await manager.getRepository(BackgroundJob).update(
      { id: job.id, tenant_id: job.tenant_id },
      {
        status: 'completed',
        result,
        completed_units: total,
        total_units: total,
        completed_at: () => 'now()',
        lease_token: null,
        ...(expires ? { expires_at: () => "now() + interval '24 hours'" } : {}),
      },
    );
  }
  fail(job: JobRecord, code: string, permanent: boolean) {
    return this.tenants.withTenant(job.tenant_id, (manager) =>
      manager
        .getRepository(BackgroundJob)
        .update(
          {
            tenant_id: job.tenant_id,
            id: job.id,
            status: 'running',
            lease_token: job.lease_token!,
          },
          {
            status: permanent || job.attempts >= 3 ? 'failed' : 'pending',
            error_code: code,
            lease_token: null,
            available_at: () => "now() + interval '10 seconds'",
            ...(permanent || job.attempts >= 3
              ? { completed_at: () => 'now()' }
              : {}),
          },
        ),
    );
  }
}

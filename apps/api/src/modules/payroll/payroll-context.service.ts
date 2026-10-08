import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, QueryFailedError } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Tenant } from '../tenants/tenant.schemas';
import { AuditLog } from '../audit/audit.schemas';
import { PayrollRun } from './payroll.schemas';
@Injectable()
export class PayrollContext {
  constructor(readonly tenants: TenantDatabaseService) {}
  async write<T>(
    actor: Principal,
    work: (
      manager: EntityManager,
      tenant: Record<string, unknown>,
    ) => Promise<T>,
  ) {
    try {
      return await this.tenants.withTenant(actor.tenantId!, async (manager) => {
        const tenant = await manager
          .getRepository(Tenant)
          .createQueryBuilder('tenant')
          .where('tenant.id = :id', { id: actor.tenantId })
          .setLock('pessimistic_write')
          .getOneOrFail();
        return work(manager, tenant);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'This payroll record or operation already exists',
        );
      throw error;
    }
  }
  async run(manager: EntityManager, tenantId: string, id: string) {
    const run = await manager
      .getRepository(PayrollRun)
      .findOneBy({ tenant_id: tenantId, id });
    if (!run) throw new NotFoundException('Payroll run not found');
    return run;
  }
  editable(run: Record<string, unknown>, version?: number) {
    if (run.status === 'locked')
      throw new ConflictException(
        'Locked payroll cannot be edited or recalculated',
      );
    if (version !== undefined && Number(run.calculation_version) !== version)
      throw new ConflictException(
        'Payroll calculation changed. Reload the run.',
      );
  }
  async unlockedDates(
    manager: EntityManager,
    tenantId: string,
    from: string,
    to?: string,
  ) {
    const query = manager
      .getRepository(PayrollRun)
      .createQueryBuilder('run')
      .where(
        'run.tenant_id = :tenantId AND run.status = :status AND run.period_end >= :from',
        { tenantId, status: 'locked', from },
      );
    if (to) query.andWhere('run.period_start <= :to', { to });
    if (await query.getExists())
      throw new ConflictException(
        'Salary changes cannot affect a locked payroll period',
      );
  }
  audit(
    manager: EntityManager,
    actor: Principal,
    id: string,
    action: string,
    metadata: object,
  ) {
    return manager
      .getRepository(AuditLog)
      .insert({
        tenant_id: actor.tenantId,
        actor_id: actor.id,
        entity_type: 'payroll',
        entity_id: id,
        action: `payroll.${action}`,
        metadata,
      });
  }
}

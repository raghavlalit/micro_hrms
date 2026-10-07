import { ConflictException, Injectable } from '@nestjs/common';
import { EntityManager, In, IsNull } from 'typeorm';
import { Tenant } from '../tenants/tenant.schemas';
import { Employee } from './employee.schemas';
import { AuditLog } from '../audit/audit.schemas';

@Injectable()
export class EmployeeAccountService {
  // All employee writes and invitation activations lock the tenant first. This
  // serializes headcount changes and prevents concurrent reporting-manager cycles.
  async lockTenant(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Tenant)
      .createQueryBuilder('tenant')
      .where('tenant.id = :tenantId', { tenantId })
      .setLock('pessimistic_write')
      .getOneOrFail();
  }
  async checkCapacity(manager: EntityManager, tenantId: string, limit: number) {
    const count = await manager
      .getRepository(Employee)
      .countBy({
        tenant_id: tenantId,
        archived_at: IsNull(),
        status: In(['invited', 'active', 'on_notice']),
      });
    if (count >= limit)
      throw new ConflictException(
        'Company employee limit reached. Invited employees also reserve a place.',
      );
  }
  async refreshCount(manager: EntityManager, tenantId: string) {
    const count = await manager
      .getRepository(Employee)
      .countBy({
        tenant_id: tenantId,
        archived_at: IsNull(),
        status: In(['active', 'on_notice']),
      });
    await manager
      .getRepository(Tenant)
      .update({ id: tenantId }, { active_employee_count: count });
  }
  async activated(manager: EntityManager, tenantId: string, userId: string) {
    const employee = await manager
      .getRepository(Employee)
      .findOneBy({ tenant_id: tenantId, user_id: userId });
    if (!employee) return; // Company administrators may have no employee profile.
    if (
      employee.archived_at ||
      !['invited', 'active', 'on_notice'].includes(String(employee.status))
    )
      throw new ConflictException(
        'This employee account is not available for activation',
      );
    if (employee.status === 'invited') {
      await manager
        .getRepository(Employee)
        .update(
          { id: String(employee.id), tenant_id: tenantId },
          { status: 'active' },
        );
      await this.refreshCount(manager, tenantId);
      await manager
        .getRepository(AuditLog)
        .insert({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'employee.activated',
          entity_type: 'employee',
          entity_id: employee.id,
          metadata: {
            before: { status: 'invited' },
            after: { status: 'active' },
          },
        });
    }
  }
}

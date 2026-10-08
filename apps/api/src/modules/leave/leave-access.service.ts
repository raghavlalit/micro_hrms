import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { AttendancePolicy } from '../attendance/attendance-policy.service';
import type { AttendanceEmployee } from '../attendance/attendance.types';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { PayrollRun } from '../payroll/payroll.schemas';
import { AuditLog } from '../audit/audit.schemas';

@Injectable()
export class LeaveAccess {
  constructor(
    readonly tenants: TenantDatabaseService,
    readonly workforce: AttendancePolicy,
  ) {}
  manages(actor: Principal) {
    return actor.permissions.includes('leave.manage');
  }
  reviews(actor: Principal) {
    return (
      this.manages(actor) || actor.permissions.includes('leave.approve.team')
    );
  }
  requireReview(actor: Principal) {
    if (!this.reviews(actor))
      throw new ForbiddenException('Leave approval access required');
  }
  async employee(
    manager: EntityManager,
    actor: Principal,
    id?: string,
  ): Promise<AttendanceEmployee> {
    if (!id) {
      if (!actor.permissions.includes('leave.self'))
        throw new ForbiddenException('Leave self-service access required');
      return this.workforce.self(manager, actor);
    }
    const employee = await this.workforce
      .employeeQuery(manager, actor.tenantId!)
      .andWhere('employee.id = :id', { id })
      .getRawOne<AttendanceEmployee>();
    if (!employee) throw new NotFoundException('Employee not found');
    if (
      this.manages(actor) ||
      (employee.user_id === actor.id &&
        actor.permissions.includes('leave.self'))
    )
      return employee;
    if (
      actor.permissions.includes('leave.approve.team') &&
      employee.manager_id === (await this.workforce.self(manager, actor)).id
    )
      return employee;
    throw new NotFoundException('Employee not found');
  }
  write<T>(
    actor: Principal,
    work: (manager: EntityManager, timezone: string) => Promise<T>,
  ) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const tenant = await this.workforce.lockTenant(manager, actor.tenantId!);
      return work(manager, String(tenant.timezone));
    });
  }
  async unlocked(
    manager: EntityManager,
    tenantId: string,
    from: string,
    to: string,
  ) {
    const locked = await manager
      .getRepository(PayrollRun)
      .createQueryBuilder('run')
      .where(
        'run.tenant_id = :tenantId AND run.status = :status AND run.period_start <= :to AND run.period_end >= :from',
        { tenantId, status: 'locked', from, to },
      )
      .getExists();
    if (locked)
      throw new ConflictException(
        'Leave cannot change within a locked payroll period',
      );
  }
  async audit(
    manager: EntityManager,
    actor: Principal,
    id: string,
    action: string,
    metadata: object,
  ) {
    await manager
      .getRepository(AuditLog)
      .insert({
        tenant_id: actor.tenantId,
        actor_id: actor.id,
        entity_type: 'leave',
        entity_id: id,
        action: `leave.${action}`,
        metadata,
      });
  }
}

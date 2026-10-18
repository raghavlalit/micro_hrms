import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
/** Read model for notification addressing only. No names, salaries or request
 * reasons enter notification payloads. Every join is explicitly tenant-scoped. */
@Injectable()
export class NotificationRecipients {
  async employee(manager: EntityManager, tenantId: string, employeeId: string) {
    return manager
      .createQueryBuilder()
      .from('employees', 'employee')
      .leftJoin(
        'employees',
        'supervisor',
        'supervisor.id = employee.manager_id AND supervisor.tenant_id = employee.tenant_id AND supervisor.archived_at IS NULL',
      )
      .select([
        'employee.user_id AS user_id',
        'supervisor.user_id AS manager_user_id',
      ])
      .where(
        'employee.tenant_id = :tenantId AND employee.id = :employeeId AND employee.archived_at IS NULL',
        { tenantId, employeeId },
      )
      .getRawOne<{ user_id: string | null; manager_user_id: string | null }>();
  }
  async permitted(
    manager: EntityManager,
    tenantId: string,
    permission: string,
  ) {
    return manager
      .createQueryBuilder()
      .from('users', 'user')
      .innerJoin(
        'user_roles',
        'membership',
        'membership.user_id = user.id AND membership.tenant_id = user.tenant_id',
      )
      .innerJoin(
        'role_permissions',
        'grant',
        'grant.role_id = membership.role_id AND grant.tenant_id = membership.tenant_id',
      )
      .select('user.id', 'id')
      .distinct(true)
      .where(
        'user.tenant_id = :tenantId AND user.status = :status AND grant.permission_code = :permission',
        { tenantId, status: 'active', permission },
      )
      .getRawMany<{ id: string }>();
  }
  async reviewers(
    manager: EntityManager,
    tenantId: string,
    employeeId: string,
    kind: 'leave' | 'attendance',
  ) {
    const employee = await this.employee(manager, tenantId, employeeId);
    if (!employee) return [];
    const people = await this.permitted(manager, tenantId, `${kind}.manage`);
    const team = await this.permitted(
      manager,
      tenantId,
      `${kind}.approve.team`,
    );
    if (
      employee.manager_user_id &&
      team.some((user) => user.id === employee.manager_user_id)
    )
      people.push({ id: employee.manager_user_id });
    return [...new Set(people.map((user) => user.id))].filter(
      (id) => id !== employee.user_id,
    );
  }
  async allowed(
    manager: EntityManager,
    tenantId: string,
    recipientId: string,
    permission: string,
  ) {
    return (await this.permitted(manager, tenantId, permission)).some(
      (user) => user.id === recipientId,
    );
  }
}

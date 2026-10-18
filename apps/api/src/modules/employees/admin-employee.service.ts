import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { User } from '../users/user.schemas';
import { AuditLog } from '../audit/audit.schemas';
import { companyToday } from '../holidays/holiday-calendar';
import { Employee } from './employee.schemas';
import { EmployeeAccountService } from './employee-account.service';

@Injectable()
export class AdminEmployeeService {
  constructor(private readonly accounts: EmployeeAccountService) {}

  // Call inside the same transaction as account/role creation. Roles belong to
  // the linked user; an employee profile must never create a second identity.
  async ensure(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    actorId: string | null = null,
  ) {
    const tenant = await this.accounts.lockTenant(manager, tenantId);
    const user = await manager
      .getRepository(User)
      .findOneByOrFail({ tenant_id: tenantId, id: userId });
    const employees = manager.getRepository(Employee);
    const linked = await employees.findOneBy({
      tenant_id: tenantId,
      user_id: userId,
    });
    if (linked) {
      if (linked.archived_at)
        throw new ConflictException(
          'Restore the linked employee profile before assigning company administrator access',
        );
      return linked;
    }

    const matching = await employees.findOneBy({
      tenant_id: tenantId,
      email: String(user.email),
    });
    if (matching) {
      if (
        matching.user_id ||
        matching.archived_at ||
        ['inactive', 'terminated'].includes(String(matching.status))
      )
        throw new ConflictException(
          'The matching employee must be available and unlinked before assigning company administrator access',
        );
      await employees.update(
        { tenant_id: tenantId, id: String(matching.id) },
        { user_id: userId },
      );
      await this.audit(
        manager,
        tenantId,
        String(matching.id),
        userId,
        actorId,
        'employee.admin_account_linked',
      );
      if (user.status === 'active')
        await this.accounts.activated(manager, tenantId, userId);
      return employees.findOneByOrFail({
        tenant_id: tenantId,
        id: String(matching.id),
      });
    }

    await this.accounts.checkCapacity(
      manager,
      tenantId,
      Number(tenant.employee_limit),
    );
    let code = `ADM-${userId.replaceAll('-', '').toUpperCase()}`;
    while (
      await employees.existsBy({ tenant_id: tenantId, employee_code: code })
    )
      code = `ADM-${randomUUID().replaceAll('-', '').toUpperCase()}`;
    const [first, ...rest] = String(user.display_name).trim().split(/\s+/);
    const id = randomUUID();
    await employees.insert({
      id,
      tenant_id: tenantId,
      user_id: userId,
      employee_code: code,
      first_name: first.slice(0, 100),
      last_name: rest.join(' ').slice(0, 100) || '-',
      email: user.email,
      // Account creation is a provisional joining date, editable by HR. Do not
      // invent salary, department, reporting manager or employment terms.
      joining_date: companyToday(
        String(tenant.timezone),
        new Date(user.created_at as Date),
      ),
      employment_type: 'Not specified',
      status:
        user.status === 'active'
          ? 'active'
          : user.status === 'disabled'
            ? 'inactive'
            : 'invited',
      address: {},
      emergency_contact: {},
    });
    await this.accounts.refreshCount(manager, tenantId);
    await this.audit(
      manager,
      tenantId,
      id,
      userId,
      actorId,
      'employee.admin_profile_created',
    );
    return employees.findOneByOrFail({ tenant_id: tenantId, id });
  }

  private audit(
    manager: EntityManager,
    tenantId: string,
    id: string,
    userId: string,
    actorId: string | null,
    action: string,
  ) {
    return manager
      .getRepository(AuditLog)
      .insert({
        tenant_id: tenantId,
        actor_id: actorId,
        entity_type: 'employee',
        entity_id: id,
        action,
        metadata: {
          user_id: userId,
          source: 'company_admin',
          review_employment_details: true,
        },
      });
  }
}

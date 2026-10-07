import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { In } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { InvitationsService } from '../auth/invitations.service';
import { Employee } from '../employees/employee.schemas';
import { Role, User, UserRole } from './user.schemas';
import { AccessPolicyService } from './access-policy.service';
import { EmployeeUserService } from './employee-user.service';
import { protectLastCompanyAdmin } from './access-safety';
import {
  AccessReasonDto,
  InviteUserDto,
  UserListDto,
  UserRolesDto,
  UserStatusDto,
} from './user-access.dto';

@Injectable()
export class UserManagementService {
  constructor(
    private readonly policy: AccessPolicyService,
    private readonly invitations: InvitationsService,
    private readonly accounts: EmployeeUserService,
  ) {}

  list(actor: Principal, dto: UserListDto) {
    return this.policy.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = manager
        .getRepository(User)
        .createQueryBuilder('user')
        .where('user.tenant_id = :tenantId', { tenantId: actor.tenantId });
      if (dto.search)
        query.andWhere(
          '(user.display_name ILIKE :search OR user.email ILIKE :search)',
          { search: `%${dto.search.replace(/[\\%_]/g, '\\$&')}%` },
        );
      if (dto.status)
        query.andWhere('user.status = :status', { status: dto.status });
      if (dto.role_id)
        query.innerJoin(
          UserRole.options.name,
          'filter_role',
          'filter_role.user_id = user.id AND filter_role.tenant_id = user.tenant_id AND filter_role.role_id = :roleId',
          { roleId: dto.role_id },
        );
      const total = await query.getCount();
      const items = await query
        .leftJoin(
          Employee.options.name,
          'employee',
          'employee.user_id = user.id AND employee.tenant_id = user.tenant_id',
        )
        .select([
          'user.id AS id',
          'user.display_name AS display_name',
          'user.email AS email',
          'user.status AS status',
          'user.last_login_at AS last_login_at',
          'employee.id AS employee_id',
          'employee.employee_code AS employee_code',
          'employee.status AS employee_status',
        ])
        .orderBy('user.display_name', 'ASC')
        .addOrderBy('user.id', 'ASC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany<{
          id: string;
          display_name: string;
          email: string;
          status: string;
          employee_id: string | null;
        }>();
      const roles = items.length
        ? await manager
            .getRepository(UserRole)
            .createQueryBuilder('membership')
            .innerJoin(
              Role.options.name,
              'role',
              'role.id = membership.role_id AND role.tenant_id = membership.tenant_id',
            )
            .select([
              'membership.user_id AS user_id',
              'role.id AS id',
              'role.name AS name',
            ])
            .where(
              'membership.tenant_id = :tenantId AND membership.user_id IN (:...ids)',
              { tenantId: actor.tenantId, ids: items.map((u) => u.id) },
            )
            .orderBy('role.name', 'ASC')
            .getRawMany<{ user_id: string; id: string; name: string }>()
        : [];
      return {
        items: items.map((user) => ({
          ...user,
          roles: roles
            .filter((r) => r.user_id === user.id)
            .map((r) => ({ id: r.id, name: r.name })),
        })),
        total,
      };
    });
  }

  invite(actor: Principal, dto: InviteUserDto) {
    return this.policy.write(actor, async (manager, tenant, owned) => {
      await this.policy.validateRoles(
        manager,
        actor.tenantId!,
        dto.role_ids,
        owned,
      );
      const employee = await manager
        .getRepository(Employee)
        .findOneBy({ tenant_id: actor.tenantId, email: dto.email });
      if (employee)
        throw new ConflictException(
          'This email belongs to an employee. Invite the account from their employee profile, then assign roles here.',
        );
      const count = await manager
        .getRepository(User)
        .countBy({
          tenant_id: actor.tenantId,
          status: In(['active', 'invited']),
        });
      if (count >= Number(tenant.user_limit))
        throw new ConflictException('Company user limit reached');
      const id = randomUUID();
      await manager
        .getRepository(User)
        .insert({
          id,
          tenant_id: actor.tenantId,
          display_name: dto.display_name,
          email: dto.email,
          status: 'invited',
        });
      await manager
        .getRepository(UserRole)
        .insert(
          dto.role_ids.map((role_id) => ({
            tenant_id: actor.tenantId,
            user_id: id,
            role_id,
          })),
        );
      const invitation = await this.invitations.issue(
        manager,
        actor.tenantId!,
        id,
      );
      await this.policy.audit(manager, actor, 'user', id, 'user.invited', {
        reason: dto.reason,
        role_ids: dto.role_ids,
      });
      return { id, invitation };
    });
  }

  roles(actor: Principal, id: string, dto: UserRolesDto) {
    return this.policy.write(actor, async (manager, _tenant, owned) => {
      await this.policy.requiredUser(manager, actor.tenantId!, id, owned);
      if (id === actor.id)
        throw new ConflictException(
          'Another authorized administrator must change your roles',
        );
      const roles = await this.policy.validateRoles(
        manager,
        actor.tenantId!,
        dto.role_ids,
        owned,
      );
      if (!roles.some((role) => role.code === 'company_admin'))
        await protectLastCompanyAdmin(manager, actor.tenantId!, id);
      const before = await manager
        .getRepository(UserRole)
        .findBy({ tenant_id: actor.tenantId, user_id: id });
      await manager
        .getRepository(UserRole)
        .delete({ tenant_id: actor.tenantId, user_id: id });
      await manager
        .getRepository(UserRole)
        .insert(
          dto.role_ids.map((role_id) => ({
            tenant_id: actor.tenantId,
            user_id: id,
            role_id,
          })),
        );
      await this.policy.revoke(manager, actor.tenantId!, [id]);
      await this.policy.audit(
        manager,
        actor,
        'user',
        id,
        'user.roles_changed',
        {
          reason: dto.reason,
          before: before.map((r) => r.role_id),
          after: dto.role_ids,
        },
      );
      return { id };
    });
  }

  status(actor: Principal, id: string, dto: UserStatusDto) {
    return this.policy.write(actor, async (manager, tenant, owned) => {
      const user = await this.policy.requiredUser(
        manager,
        actor.tenantId!,
        id,
        owned,
      );
      if (id === actor.id)
        throw new ConflictException('You cannot disable your own account');
      const enabled = dto.status === 'enabled';
      if (enabled) {
        const employee = await manager
          .getRepository(Employee)
          .findOneBy({ tenant_id: actor.tenantId, user_id: id });
        if (
          employee &&
          (employee.archived_at ||
            ['inactive', 'terminated'].includes(String(employee.status)))
        )
          throw new ConflictException(
            'Reactivate the employee profile before enabling this account',
          );
      }
      await this.accounts.syncStatus(
        manager,
        actor.tenantId!,
        id,
        enabled,
        Number(tenant.user_limit),
      );
      await this.policy.audit(
        manager,
        actor,
        'user',
        id,
        'user.status_changed',
        {
          reason: dto.reason,
          before: user.status,
          after: enabled
            ? user.password_hash
              ? 'active'
              : 'invited'
            : 'disabled',
        },
      );
      return { id };
    });
  }

  reinvite(actor: Principal, id: string, dto: AccessReasonDto) {
    return this.policy.write(actor, async (manager, _tenant, owned) => {
      await this.policy.requiredUser(manager, actor.tenantId!, id, owned);
      const invitation = await this.invitations.issue(
        manager,
        actor.tenantId!,
        id,
      );
      await this.policy.audit(
        manager,
        actor,
        'user',
        id,
        'user.invitation_reissued',
        { reason: dto.reason },
      );
      return { id, invitation };
    });
  }
}

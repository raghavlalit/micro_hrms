import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In, IsNull, QueryFailedError } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { Session } from '../auth/auth.schemas';
import { AuditLog } from '../audit/audit.schemas';
import { Tenant } from '../tenants/tenant.schemas';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Role, RolePermission, User, UserRole } from './user.schemas';

@Injectable()
export class AccessPolicyService {
  constructor(readonly tenants: TenantDatabaseService) {}

  async permissions(manager: EntityManager, tenantId: string, userId: string) {
    const rows = await manager
      .getRepository(UserRole)
      .createQueryBuilder('membership')
      .innerJoin(
        RolePermission.options.name,
        'permission',
        'permission.role_id = membership.role_id AND permission.tenant_id = membership.tenant_id',
      )
      .select('permission.permission_code', 'code')
      .distinct(true)
      .where(
        'membership.tenant_id = :tenantId AND membership.user_id = :userId',
        { tenantId, userId },
      )
      .getRawMany<{ code: string }>();
    return rows.map((row) => row.code);
  }

  async write<T>(
    actor: Principal,
    work: (
      manager: EntityManager,
      tenant: Record<string, unknown>,
      permissions: string[],
    ) => Promise<T>,
  ) {
    if (actor.kind !== 'tenant' || !actor.permissions.includes('roles.manage'))
      throw new ForbiddenException('Access management permission required');
    try {
      return await this.tenants.withTenant(actor.tenantId!, async (manager) => {
        // Same first lock as employee writes/activation: limits and administrator safety are atomic.
        const tenant = await manager
          .getRepository(Tenant)
          .createQueryBuilder('tenant')
          .where('tenant.id = :id', { id: actor.tenantId })
          .setLock('pessimistic_write')
          .getOneOrFail();
        const current = await manager
          .getRepository(User)
          .findOneBy({
            id: actor.id,
            tenant_id: actor.tenantId,
            status: 'active',
          });
        const permissions = await this.permissions(
          manager,
          actor.tenantId!,
          actor.id,
        );
        // Recheck after acquiring the lock; another administrator may have just removed access.
        if (!current || !permissions.includes('roles.manage'))
          throw new ForbiddenException('Access management permission required');
        return work(manager, tenant, permissions);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'This email or role code already exists in this company',
        );
      throw error;
    }
  }

  assertDelegable(requested: string[], owned: string[]) {
    if (requested.some((code) => !owned.includes(code)))
      throw new ForbiddenException(
        'You can only manage or grant permissions you already hold',
      );
  }

  async validateRoles(
    manager: EntityManager,
    tenantId: string,
    ids: string[],
    owned: string[],
  ) {
    const roles = await manager
      .getRepository(Role)
      .findBy({ tenant_id: tenantId, id: In(ids) });
    if (roles.length !== ids.length)
      throw new NotFoundException(
        'One or more roles do not belong to this company',
      );
    const permissions = await manager
      .getRepository(RolePermission)
      .findBy({ tenant_id: tenantId, role_id: In(ids) });
    this.assertDelegable(
      permissions.map((row) => String(row.permission_code)),
      owned,
    );
    return roles;
  }

  async requiredUser(
    manager: EntityManager,
    tenantId: string,
    id: string,
    owned: string[],
  ) {
    const user = await manager
      .getRepository(User)
      .findOneBy({ tenant_id: tenantId, id });
    if (!user) throw new NotFoundException('User not found');
    this.assertDelegable(await this.permissions(manager, tenantId, id), owned);
    return user;
  }

  async revoke(manager: EntityManager, tenantId: string, ids: string[]) {
    if (ids.length)
      await manager
        .getRepository(Session)
        .update(
          { tenant_id: tenantId, user_id: In(ids), revoked_at: IsNull() },
          { revoked_at: () => 'now()' },
        );
  }

  async audit(
    manager: EntityManager,
    actor: Principal,
    entity: 'user' | 'role',
    id: string,
    action: string,
    metadata: object,
  ) {
    await manager
      .getRepository(AuditLog)
      .insert({
        tenant_id: actor.tenantId,
        actor_id: actor.id,
        entity_type: entity,
        entity_id: id,
        action,
        metadata,
      });
  }
}

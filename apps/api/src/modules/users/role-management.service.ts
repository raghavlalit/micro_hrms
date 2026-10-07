import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { Permission, Role, RolePermission, UserRole } from './user.schemas';
import { AccessPolicyService } from './access-policy.service';
import { BUILT_IN_ROLES } from './access-safety';
import { CreateRoleDto, RoleDetailsDto } from './user-access.dto';

@Injectable()
export class RoleManagementService {
  constructor(private readonly policy: AccessPolicyService) {}

  catalog(actor: Principal) {
    return this.policy.tenants.withTenant(actor.tenantId!, async (manager) => {
      const roles = await manager
        .getRepository(Role)
        .find({ where: { tenant_id: actor.tenantId }, order: { name: 'ASC' } });
      const assignments = await manager
        .getRepository(UserRole)
        .findBy({ tenant_id: actor.tenantId });
      const grants = await manager
        .getRepository(RolePermission)
        .findBy({ tenant_id: actor.tenantId });
      const permissions = await manager
        .getRepository(Permission)
        .find({
          select: { code: true, description: true },
          order: { code: 'ASC' },
        });
      return {
        permissions,
        roles: roles.map((role) => {
          const codes = grants
            .filter((p) => p.role_id === role.id)
            .map((p) => String(p.permission_code))
            .sort();
          return {
            id: role.id,
            code: role.code,
            name: role.name,
            permission_codes: codes,
            built_in: BUILT_IN_ROLES.includes(String(role.code)),
            user_count: assignments.filter((a) => a.role_id === role.id).length,
            assigned_to_me: assignments.some(
              (a) => a.role_id === role.id && a.user_id === actor.id,
            ),
            can_assign: codes.every((code) => actor.permissions.includes(code)),
          };
        }),
      };
    });
  }

  private async validatePermissions(
    manager: EntityManager,
    requested: string[],
    owned: string[],
  ) {
    const catalog = await manager.getRepository(Permission).find();
    if (requested.some((code) => !catalog.some((p) => p.code === code)))
      throw new BadRequestException('Unknown permission code');
    this.policy.assertDelegable(requested, owned);
  }

  create(actor: Principal, dto: CreateRoleDto) {
    return this.policy.write(actor, async (manager, _tenant, owned) => {
      if (BUILT_IN_ROLES.includes(dto.code))
        throw new ConflictException(
          'This code is reserved for a built-in role',
        );
      await this.validatePermissions(manager, dto.permission_codes, owned);
      const id = randomUUID();
      await manager
        .getRepository(Role)
        .insert({
          id,
          tenant_id: actor.tenantId,
          code: dto.code,
          name: dto.name,
        });
      await manager
        .getRepository(RolePermission)
        .insert(
          dto.permission_codes.map((code) => ({
            tenant_id: actor.tenantId,
            role_id: id,
            permission_code: code,
          })),
        );
      await this.policy.audit(manager, actor, 'role', id, 'role.created', {
        reason: dto.reason,
        code: dto.code,
        name: dto.name,
        permission_codes: dto.permission_codes,
      });
      return { id };
    });
  }

  update(actor: Principal, id: string, dto: RoleDetailsDto) {
    return this.policy.write(actor, async (manager, _tenant, owned) => {
      const role = await manager
        .getRepository(Role)
        .findOneBy({ tenant_id: actor.tenantId, id });
      if (!role) throw new NotFoundException('Role not found');
      if (BUILT_IN_ROLES.includes(String(role.code)))
        throw new ConflictException(
          'Built-in roles are read-only. Create a custom role for different permissions.',
        );
      const assignments = await manager
        .getRepository(UserRole)
        .findBy({ tenant_id: actor.tenantId, role_id: id });
      if (assignments.some((a) => a.user_id === actor.id))
        throw new ConflictException(
          'Another authorized administrator must edit a role assigned to you',
        );
      const old = await manager
        .getRepository(RolePermission)
        .findBy({ tenant_id: actor.tenantId, role_id: id });
      this.policy.assertDelegable(
        old.map((p) => String(p.permission_code)),
        owned,
      );
      await this.validatePermissions(manager, dto.permission_codes, owned);
      await manager
        .getRepository(Role)
        .update({ tenant_id: actor.tenantId, id }, { name: dto.name });
      await manager
        .getRepository(RolePermission)
        .delete({ tenant_id: actor.tenantId, role_id: id });
      await manager
        .getRepository(RolePermission)
        .insert(
          dto.permission_codes.map((code) => ({
            tenant_id: actor.tenantId,
            role_id: id,
            permission_code: code,
          })),
        );
      await this.policy.revoke(
        manager,
        actor.tenantId!,
        assignments.map((a) => String(a.user_id)),
      );
      await this.policy.audit(manager, actor, 'role', id, 'role.updated', {
        reason: dto.reason,
        before: {
          name: role.name,
          permission_codes: old.map((p) => p.permission_code),
        },
        after: { name: dto.name, permission_codes: dto.permission_codes },
      });
      return { id };
    });
  }
}

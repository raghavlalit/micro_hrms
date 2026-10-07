import { ConflictException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, In, IsNull } from 'typeorm';
import { Role, User, UserRole } from './user.schemas';
import { AuthToken, Session } from '../auth/auth.schemas';
import { protectLastCompanyAdmin } from './access-safety';

@Injectable()
export class EmployeeUserService {
  async inviteIdentity(
    manager: EntityManager,
    tenantId: string,
    name: string,
    email: string,
    roleCode: string,
    userLimit: number,
  ) {
    const existing = await manager
      .getRepository(User)
      .findOneBy({ tenant_id: tenantId, email });
    if (existing)
      throw new ConflictException(
        'This email already belongs to a company user. Use a different employee email; existing accounts are not linked automatically.',
      );
    const count = await manager
      .getRepository(User)
      .countBy({ tenant_id: tenantId, status: In(['invited', 'active']) });
    if (count >= userLimit)
      throw new ConflictException('Company user limit reached');
    const role = await manager
      .getRepository(Role)
      .findOneBy({ tenant_id: tenantId, code: roleCode });
    if (!role)
      throw new ConflictException(
        'The selected employee role is not configured',
      );
    const id = randomUUID();
    await manager.getRepository(User).insert({
      id,
      tenant_id: tenantId,
      email,
      display_name: name,
      status: 'invited',
    });
    await manager
      .getRepository(UserRole)
      .insert({ tenant_id: tenantId, user_id: id, role_id: role.id });
    return id;
  }
  async syncStatus(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    enabled: boolean,
    userLimit: number,
  ) {
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId AND user.tenant_id = :tenantId', {
        userId,
        tenantId,
      })
      .setLock('pessimistic_write')
      .getOneOrFail();
    if (!enabled) await protectLastCompanyAdmin(manager, tenantId, userId);
    if (enabled && user.status === 'disabled') {
      const count = await manager
        .getRepository(User)
        .countBy({ tenant_id: tenantId, status: In(['invited', 'active']) });
      if (count >= userLimit)
        throw new ConflictException('Company user limit reached');
    }
    await manager.getRepository(User).update(
      { id: userId, tenant_id: tenantId },
      {
        status: enabled
          ? user.password_hash
            ? 'active'
            : 'invited'
          : 'disabled',
      },
    );
    if (!enabled) {
      await manager
        .getRepository(Session)
        .update(
          { user_id: userId, tenant_id: tenantId, revoked_at: IsNull() },
          { revoked_at: () => 'now()' },
        );
      await manager
        .getRepository(AuthToken)
        .update(
          { user_id: userId, tenant_id: tenantId, consumed_at: IsNull() },
          { consumed_at: () => 'now()' },
        );
    }
  }
}

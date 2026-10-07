import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { User, UserRole, RolePermission } from '../users/user.schemas';
import { PlatformAdmin } from '../platform/platform.schemas';
import { AuthRateLimit, PlatformSession, Session } from './auth.schemas';

export interface AuthIdentity {
  id: string;
  email: string;
  password_hash: string | null;
  status?: string;
  disabled_at?: Date | null;
  must_change_password?: boolean;
}

/** Always use the caller's transaction manager for tenant/session operations. */
@Injectable()
export class AuthRepository {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async incrementAttempts(key: string): Promise<number> {
    // INSERT-if-absent followed by an atomic UPDATE serializes concurrent callers.
    // Commit the counter even when the caller later rejects the login attempt.
    return this.db.transaction(async (manager) => {
      const repository = manager.getRepository(AuthRateLimit);
      await repository
        .createQueryBuilder()
        .insert()
        .values({
          key,
          attempts: 0,
          expires_at: () => "now() + interval '15 minutes'",
        })
        .orIgnore()
        .execute();
      const result = await repository
        .createQueryBuilder()
        .update()
        .set({
          attempts: () =>
            'CASE WHEN expires_at <= now() THEN 1 ELSE attempts + 1 END',
          expires_at: () =>
            "CASE WHEN expires_at <= now() THEN now() + interval '15 minutes' ELSE expires_at END",
        })
        .where('key = :key', { key })
        .returning('attempts')
        .execute();
      const rows = result.raw as { attempts: number }[];
      return rows[0].attempts;
    });
  }

  lockIdentity(
    manager: EntityManager,
    tenantId: string | undefined,
    field: 'email' | 'id',
    value: string,
  ) {
    return manager
      .getRepository(tenantId ? User : PlatformAdmin)
      .createQueryBuilder('identity')
      .select('identity.*')
      .where(`identity.${field} = :value`, { value })
      .setLock('pessimistic_write')
      .getRawOne<AuthIdentity>();
  }

  async createSession(
    manager: EntityManager,
    tenantId: string | undefined,
    userId: string,
    hash: string,
  ): Promise<void> {
    await manager
      .getRepository(tenantId ? Session : PlatformSession)
      .createQueryBuilder()
      .insert()
      .values({
        ...(tenantId
          ? { tenant_id: tenantId, user_id: userId }
          : { platform_admin_id: userId }),
        credential_hash: hash,
        expires_at: () => "now() + interval '8 hours'",
      })
      .execute();
    if (tenantId)
      await manager
        .getRepository(User)
        .update({ id: userId }, { last_login_at: () => 'now()' });
  }

  findSessionIdentity(
    manager: EntityManager,
    tenantId: string | undefined,
    hash: string,
  ) {
    return manager
      .getRepository(tenantId ? User : PlatformAdmin)
      .createQueryBuilder('identity')
      .select('identity.*')
      .innerJoin(
        (tenantId ? Session : PlatformSession).options.name,
        'session',
        tenantId
          ? 'session.user_id = identity.id AND session.tenant_id = identity.tenant_id'
          : 'session.platform_admin_id = identity.id',
      )
      .where('session.credential_hash = :hash', { hash })
      .andWhere('session.revoked_at IS NULL')
      .andWhere('session.expires_at > now()')
      .andWhere(
        tenantId ? 'identity.status = :status' : 'identity.disabled_at IS NULL',
        { status: 'active' },
      )
      .getRawOne<AuthIdentity>();
  }

  async permissions(manager: EntityManager, userId: string): Promise<string[]> {
    const rows = await manager
      .getRepository(UserRole)
      .createQueryBuilder('membership')
      .innerJoin(
        RolePermission.options.name,
        'permission',
        'permission.tenant_id = membership.tenant_id AND permission.role_id = membership.role_id',
      )
      .select('permission.permission_code', 'code')
      .distinct(true)
      .where('membership.user_id = :userId', { userId })
      .getRawMany<{ code: string }>();
    return rows.map((row) => row.code);
  }

  async revokeSessions(
    manager: EntityManager,
    tenantId: string | undefined,
    value: string,
    all: boolean,
  ): Promise<void> {
    const column = all
      ? tenantId
        ? 'user_id'
        : 'platform_admin_id'
      : 'credential_hash';
    await manager
      .getRepository(tenantId ? Session : PlatformSession)
      .createQueryBuilder()
      .update()
      .set({ revoked_at: () => 'now()' })
      .where(`${column} = :value`, { value })
      .andWhere('revoked_at IS NULL')
      .execute();
  }

  async updatePassword(
    manager: EntityManager,
    tenantId: string | undefined,
    id: string,
    hash: string,
  ): Promise<void> {
    await manager.getRepository(tenantId ? User : PlatformAdmin).update(
      { id },
      {
        password_hash: hash,
        ...(tenantId ? {} : { must_change_password: false }),
      },
    );
  }
}

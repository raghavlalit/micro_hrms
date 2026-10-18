import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { TenantDirectoryService } from '../tenants/tenant-directory.service';
import { NotificationEvents } from '../notifications/notification-events.service';
import { NotificationConfig } from '../notifications/notification-config';
import { AuditLog } from '../audit/audit.schemas';
import { AuthToken } from './auth.schemas';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { credentialHash, hashPassword } from './password';
import { ForgotPasswordDto, ResetPasswordDto } from './password-recovery.dto';

export const RESET_REQUEST_MESSAGE =
  'If an active account matches these details, a password reset link will be emailed. Check your inbox and spam folder.';
const invalidLink = () =>
  new UnauthorizedException(
    'Password reset link is invalid or expired. Request a new link.',
  );

@Injectable()
export class PasswordRecoveryService {
  constructor(
    private readonly tenants: TenantDatabaseService,
    private readonly directory: TenantDirectoryService,
    private readonly repository: AuthRepository,
    private readonly auth: AuthService,
    private readonly notifications: NotificationEvents,
    private readonly config: NotificationConfig,
  ) {}

  async request(dto: ForgotPasswordDto, ip: string) {
    await this.auth.throttle(`reset-request-ip:${ip}`, 30);
    await this.auth.throttle(`reset-request:${dto.company}:${dto.email}`, 5);
    const started = Date.now();
    try {
      // Recovery requires email possession. Never return a manual reset link,
      // even in development, or invalidate links when delivery is disabled.
      if (this.config.driver !== 'smtp') return;
      const tenantId = await this.directory.findActiveIdBySlug(dto.company);
      if (!tenantId) return;
      await this.tenants.withTenant(tenantId, async (manager) => {
        const user = await this.repository.lockIdentity(
          manager,
          tenantId,
          'email',
          dto.email,
        );
        if (!user || user.status !== 'active' || !user.password_hash) return;
        await this.repository.invalidatePasswordResets(
          manager,
          tenantId,
          user.id,
        );
        const token = `${tenantId}.r.${randomBytes(32).toString('hex')}`;
        const result = await manager
          .getRepository(AuthToken)
          .createQueryBuilder()
          .insert()
          .values({
            tenant_id: tenantId,
            user_id: user.id,
            purpose: 'password_reset',
            token_hash: credentialHash(token),
            expires_at: () => "now() + interval '30 minutes'",
          })
          .returning('id')
          .execute();
        const rows = result.raw as { id: string }[];
        await this.notifications.passwordReset(
          manager,
          tenantId,
          user.id,
          rows[0].id,
          token,
        );
        await manager.getRepository(AuditLog).insert({
          tenant_id: tenantId,
          actor_id: null,
          action: 'user.password_reset_requested',
          entity_type: 'user',
          entity_id: user.id,
        });
      });
    } catch (error) {
      // A company can be suspended between lookup and transaction scope.
      if (!(error instanceof ForbiddenException)) throw error;
    } finally {
      // Reduce the obvious fast-path timing difference for unknown accounts.
      // This is a minimum response time, not a constant-time network guarantee.
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(0, 300 - (Date.now() - started))),
      );
    }
  }

  async reset(dto: ResetPasswordDto, ip: string) {
    await this.auth.throttle(`reset-submit-ip:${ip}`, 50);
    await this.auth.throttle(
      `reset-submit-token:${credentialHash(dto.token)}`,
      10,
    );
    const tenantId = dto.token.split('.')[0];
    const hash = await hashPassword(dto.password);
    try {
      await this.tenants.withTenant(tenantId, async (manager) => {
        const tokens = manager.getRepository(AuthToken);
        const record = await tokens.findOneBy({
          tenant_id: tenantId,
          token_hash: credentialHash(dto.token),
          purpose: 'password_reset',
        });
        if (!record) throw invalidLink();
        const userId = String(record.user_id);
        // Match login, issuance and password-change lock order: user, then token.
        const user = await this.repository.lockIdentity(
          manager,
          tenantId,
          'id',
          userId,
        );
        const valid = await tokens
          .createQueryBuilder('token')
          .where('token.tenant_id = :tenantId AND token.id = :id', {
            tenantId,
            id: record.id,
          })
          .andWhere('token.consumed_at IS NULL AND token.expires_at > now()')
          .setLock('pessimistic_write')
          .getOne();
        if (!valid || !user || user.status !== 'active' || !user.password_hash)
          throw invalidLink();
        await this.repository.updatePassword(manager, tenantId, userId, hash);
        await this.repository.invalidatePasswordResets(
          manager,
          tenantId,
          userId,
        );
        await this.repository.revokeSessions(manager, tenantId, userId, true);
        await manager.getRepository(AuditLog).insert({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'user.password_reset',
          entity_type: 'user',
          entity_id: userId,
        });
      });
    } catch (error) {
      if (error instanceof ForbiddenException) throw invalidLink();
      throw error;
    }
  }
}

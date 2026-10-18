import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { User } from '../users/user.schemas';
import { AuthToken } from '../auth/auth.schemas';
import { credentialHash } from '../auth/password';
import { Notification, OutboxEvent } from './notification.schemas';
import { NotificationPayload } from './notification-events.service';
import { NotificationRecipients } from './notification-recipients';
import { NotificationConfig } from './notification-config';
import { NotificationSecret } from './notification-secret';
import { EmailProvider } from './email-provider';
export const NOTIFICATION_MAX_ATTEMPTS = 5;
@Injectable()
export class NotificationDelivery {
  constructor(
    readonly tenants: TenantDatabaseService,
    readonly config: NotificationConfig,
    readonly secrets: NotificationSecret,
    readonly recipients: NotificationRecipients,
    readonly email: EmailProvider,
  ) {}
  async deliver(tenantId: string, id: string) {
    const retry = await this.tenants.withTenant(tenantId, async (manager) => {
      const events = manager.getRepository(OutboxEvent);
      const event = await events
        .createQueryBuilder('event')
        .where(
          'event.tenant_id = :tenantId AND event.id = :id AND event.event_type = :type',
          { tenantId, id, type: 'notification.email' },
        )
        .setLock('pessimistic_write')
        .getOne();
      if (!event || event.delivery_status !== 'pending' || event.processed_at)
        return false;
      if (new Date(event.available_at as Date).getTime() > Date.now())
        return false;
      const payload = event.payload as NotificationPayload;
      const validId = (value: unknown) =>
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          value,
        );
      if (
        !payload ||
        !validId(payload.notification_id) ||
        !validId(payload.recipient_id) ||
        event.aggregate_id !== payload.notification_id ||
        ![
          'invitation',
          'password_reset',
          'leave',
          'attendance',
          'payslip',
        ].includes(payload.kind) ||
        !['self', 'reviewer'].includes(payload.audience) ||
        (payload.kind === 'invitation' || payload.kind === 'password_reset'
          ? !validId(payload.auth_token_id)
          : !validId(payload.employee_id))
      ) {
        await events.update(
          { tenant_id: tenantId, id },
          {
            delivery_status: 'failed',
            processed_at: new Date(),
            last_error_code: 'INVALID_NOTIFICATION_PAYLOAD',
            encrypted_secret: null,
          },
        );
        return false;
      }
      const notification = await manager.getRepository(Notification).findOneBy({
        tenant_id: tenantId,
        id: payload.notification_id,
        recipient_id: payload.recipient_id,
      });
      const user = await manager
        .getRepository(User)
        .findOneBy({ tenant_id: tenantId, id: payload.recipient_id });
      const finish = async (status: string, code: string | null) => {
        await events.update(
          { tenant_id: tenantId, id },
          {
            delivery_status: status,
            processed_at: new Date(),
            last_error_code: code,
            encrypted_secret: null,
          },
        );
      };
      if (!notification || !user) {
        await finish('skipped', 'RECIPIENT_UNAVAILABLE');
        return false;
      }
      if (this.config.driver === 'disabled') {
        await finish('skipped', 'EMAIL_DISABLED');
        return false;
      }
      let token: string | undefined;
      if (payload.kind === 'invitation' || payload.kind === 'password_reset') {
        const reset = payload.kind === 'password_reset';
        const invitation = payload.auth_token_id
          ? await manager.getRepository(AuthToken).findOneBy({
              tenant_id: tenantId,
              id: payload.auth_token_id,
              user_id: payload.recipient_id,
              purpose: reset ? 'password_reset' : 'invitation',
            })
          : null;
        if (
          user.status !== (reset ? 'active' : 'invited') ||
          !invitation ||
          invitation.consumed_at ||
          new Date(invitation.expires_at as Date).getTime() <= Date.now()
        ) {
          await finish(
            'skipped',
            reset
              ? 'RESET_EXPIRED_OR_REPLACED'
              : 'INVITATION_EXPIRED_OR_REPLACED',
          );
          return false;
        }
        try {
          token = this.secrets.open(
            String(event.encrypted_secret),
            tenantId,
            id,
          );
          if (credentialHash(token) !== invitation.token_hash)
            throw new Error('Invalid token');
        } catch {
          await finish(
            'failed',
            reset
              ? 'RESET_SECRET_UNAVAILABLE'
              : 'INVITATION_SECRET_UNAVAILABLE',
          );
          return false;
        }
      } else if (
        user.status !== 'active' ||
        !(await this.allowed(manager, tenantId, payload))
      ) {
        await finish('skipped', 'RECIPIENT_ACCESS_CHANGED');
        return false;
      }
      const attempts = Number(event.attempts) + 1;
      try {
        const url = token
          ? `${this.config.webOrigin}/${payload.kind === 'password_reset' ? 'reset-password' : 'activate'}#${encodeURIComponent(token)}`
          : `${this.config.webOrigin}${notificationLink(String(notification.resource_type), String(notification.resource_id), payload.audience)}`;
        // No leave reasons, salary figures or attachments are sent over email.
        await this.email.send({
          to: String(user.email),
          subject: `Micro HRMS: ${String(notification.title)}`,
          text: `${String(notification.body)}\n\n${url}\n\n${token ? 'This link is time-limited and can be used once.' : 'Sign in with your company account to continue.'}`,
          messageId: `<notification-${id}@microhrms.invalid>`,
        });
        await events.update(
          { tenant_id: tenantId, id },
          {
            attempts,
            delivery_status: 'sent',
            processed_at: new Date(),
            last_error_code: null,
            encrypted_secret: null,
          },
        );
        return false;
      } catch {
        // Provider exceptions may contain recipients or credentials. Store/log
        // only this fixed code, commit the attempt, then let BullMQ retry.
        const failed = attempts >= NOTIFICATION_MAX_ATTEMPTS;
        await events.update(
          { tenant_id: tenantId, id },
          {
            attempts,
            delivery_status: failed ? 'failed' : 'pending',
            last_error_code: 'SMTP_DELIVERY_FAILED',
            available_at: new Date(Date.now() + 1000 * 2 ** attempts),
            ...(failed
              ? {
                  processed_at: new Date(),
                  ...(payload.kind === 'invitation' ||
                  payload.kind === 'password_reset'
                    ? { encrypted_secret: null }
                    : {}),
                }
              : {}),
          },
        );
        return !failed;
      }
    });
    if (retry) throw new Error('NOTIFICATION_DELIVERY_RETRY');
  }
  private async allowed(
    manager: EntityManager,
    tenantId: string,
    payload: NotificationPayload,
  ) {
    if (!payload.employee_id) return false;
    if (
      payload.audience === 'reviewer' &&
      (payload.kind === 'leave' || payload.kind === 'attendance')
    )
      return (
        await this.recipients.reviewers(
          manager,
          tenantId,
          payload.employee_id,
          payload.kind,
        )
      ).includes(payload.recipient_id);
    const employee = await this.recipients.employee(
      manager,
      tenantId,
      payload.employee_id,
    );
    if (employee?.user_id !== payload.recipient_id) return false;
    const permission =
      payload.kind === 'payslip'
        ? 'payslips.read.self'
        : payload.kind === 'leave'
          ? 'leave.self'
          : payload.kind === 'attendance'
            ? 'attendance.self'
            : null;
    return (
      !!permission &&
      this.recipients.allowed(
        manager,
        tenantId,
        payload.recipient_id,
        permission,
      )
    );
  }
}
export function notificationLink(kind: string, id: string, audience = 'self') {
  if (kind === 'password_reset') return '/forgot-password';
  if (kind === 'leave')
    return audience === 'reviewer' ? '/leave/requests' : '/leave';
  if (kind === 'attendance') return '/attendance';
  if (kind === 'payslip' && /^[0-9a-f-]{36}$/i.test(id))
    return `/payroll/payslips/${id}`;
  return '/company/overview';
}

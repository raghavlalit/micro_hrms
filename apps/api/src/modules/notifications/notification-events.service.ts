import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { Notification, OutboxEvent } from './notification.schemas';
import { NotificationConfig } from './notification-config';
import { NotificationSecret } from './notification-secret';
import { NotificationRecipients } from './notification-recipients';
export interface NotificationPayload {
  recipient_id: string;
  notification_id: string;
  kind: 'invitation' | 'password_reset' | 'leave' | 'attendance' | 'payslip';
  audience: 'self' | 'reviewer';
  employee_id?: string;
  auth_token_id?: string;
}
@Injectable()
export class NotificationEvents {
  constructor(
    readonly config: NotificationConfig,
    readonly secrets: NotificationSecret,
    readonly recipients: NotificationRecipients,
  ) {}
  private async record(
    manager: EntityManager,
    tenantId: string,
    key: string,
    title: string,
    body: string,
    resourceId: string,
    payload: Omit<NotificationPayload, 'notification_id'>,
    token?: string,
  ) {
    // Persist intent with the business transaction. Redis/SMTP are never called
    // here: transport outages cannot undo an approval or published payslip.
    const id = randomUUID(),
      eventId = randomUUID();
    const created = await manager
      .getRepository(Notification)
      .createQueryBuilder()
      .insert()
      .values({
        id,
        tenant_id: tenantId,
        recipient_id: payload.recipient_id,
        type: key.split(':')[0],
        title,
        body,
        resource_type: payload.kind,
        resource_id: resourceId,
        event_key: key,
      })
      .orIgnore()
      .returning('id')
      .execute();
    if (!created.raw.length) return;
    await manager.getRepository(OutboxEvent).insert({
      id: eventId,
      tenant_id: tenantId,
      event_type: 'notification.email',
      aggregate_id: id,
      idempotency_key: `notification/${id}`,
      payload: { ...payload, notification_id: id },
      delivery_status:
        this.config.driver === 'disabled' ? 'skipped' : 'pending',
      processed_at: this.config.driver === 'disabled' ? new Date() : null,
      last_error_code:
        this.config.driver === 'disabled' ? 'EMAIL_DISABLED' : null,
      encrypted_secret:
        token && this.config.driver === 'smtp'
          ? this.secrets.seal(token, tenantId, eventId)
          : null,
    });
  }
  invitation(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    tokenId: string,
    token: string,
  ) {
    return this.record(
      manager,
      tenantId,
      `invitation:${tokenId}`,
      'Your account invitation',
      'Activate your account using the invitation email or the link supplied by your administrator.',
      userId,
      {
        recipient_id: userId,
        kind: 'invitation',
        audience: 'self',
        auth_token_id: tokenId,
      },
      token,
    );
  }
  passwordReset(
    manager: EntityManager,
    tenantId: string,
    userId: string,
    tokenId: string,
    token: string,
  ) {
    return this.record(
      manager,
      tenantId,
      `password_reset:${tokenId}`,
      'Reset your password',
      'A password reset was requested for your company account. The reset link expires in 30 minutes. If you did not request this, you can ignore it. Your password has not changed.',
      userId,
      {
        recipient_id: userId,
        kind: 'password_reset',
        audience: 'self',
        auth_token_id: tokenId,
      },
      token,
    );
  }
  async workflow(
    manager: EntityManager,
    tenantId: string,
    kind: 'leave' | 'attendance',
    id: string,
    employeeId: string,
    decision: 'submitted' | 'approved' | 'rejected' | 'cancelled',
  ) {
    const employee = await this.recipients.employee(
      manager,
      tenantId,
      employeeId,
    );
    if (!employee) return;
    const subject =
      kind === 'leave' ? 'Leave request' : 'Attendance correction';
    const recipients =
      decision === 'submitted'
        ? await this.recipients.reviewers(manager, tenantId, employeeId, kind)
        : employee.user_id
          ? [employee.user_id]
          : [];
    for (const recipientId of recipients)
      await this.record(
        manager,
        tenantId,
        `${kind}.${decision}:${id}`,
        `${subject} ${decision}`,
        decision === 'submitted'
          ? 'A request is waiting for your review. Sign in to view the details.'
          : `Your ${subject.toLowerCase()} was ${decision}. Sign in to view the details.`,
        id,
        {
          recipient_id: recipientId,
          kind,
          audience: decision === 'submitted' ? 'reviewer' : 'self',
          employee_id: employeeId,
        },
      );
  }
  async payslip(
    manager: EntityManager,
    tenantId: string,
    employeeId: string,
    payslipId: string,
  ) {
    const employee = await this.recipients.employee(
      manager,
      tenantId,
      employeeId,
    );
    if (!employee?.user_id) return;
    await this.record(
      manager,
      tenantId,
      `payslip.published:${payslipId}`,
      'Your payslip is available',
      'A payslip has been published. Sign in to view or download it securely.',
      payslipId,
      {
        recipient_id: employee.user_id,
        kind: 'payslip',
        audience: 'self',
        employee_id: employeeId,
      },
    );
  }
}

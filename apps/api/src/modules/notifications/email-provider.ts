import { Injectable } from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';
import { NotificationConfig } from './notification-config';
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  messageId: string;
}
export abstract class EmailProvider {
  abstract send(message: EmailMessage): Promise<void>;
}
@Injectable()
export class SmtpEmailProvider extends EmailProvider {
  private readonly transport?: Transporter;
  private readonly from =
    process.env.SMTP_FROM ?? 'Micro HRMS <no-reply@microhrms.test>';
  constructor(config: NotificationConfig) {
    super();
    if (config.driver === 'disabled') return;
    const host = process.env.SMTP_HOST ?? '127.0.0.1',
      port = Number(process.env.SMTP_PORT ?? 1025);
    const secure = process.env.SMTP_SECURE ?? 'false',
      requireTLS =
        process.env.SMTP_REQUIRE_TLS ??
        (process.env.NODE_ENV === 'production' ? 'true' : 'false');
    if (
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      ![secure, requireTLS].every((value) => ['true', 'false'].includes(value))
    )
      throw new Error('Invalid SMTP port or TLS settings');
    if (
      process.env.NODE_ENV === 'production' &&
      ((secure !== 'true' && requireTLS !== 'true') || !process.env.SMTP_FROM)
    )
      throw new Error('Production SMTP requires TLS and SMTP_FROM');
    if (!!process.env.SMTP_USER !== !!process.env.SMTP_PASSWORD)
      throw new Error('Provide both SMTP_USER and SMTP_PASSWORD');
    if (/[\r\n]/.test(this.from)) throw new Error('Invalid SMTP_FROM');
    this.transport = nodemailer.createTransport({
      host,
      port,
      secure: secure === 'true',
      requireTLS: requireTLS === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
      tls: { rejectUnauthorized: true },
    });
  }
  async send(message: EmailMessage) {
    if (!this.transport) throw new Error('Email delivery is disabled');
    await this.transport.sendMail({ ...message, from: this.from });
  }
}

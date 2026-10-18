import { Injectable } from '@nestjs/common';
@Injectable()
export class NotificationConfig {
  readonly driver = process.env.EMAIL_DRIVER ?? 'disabled';
  readonly webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:4200';
  readonly keyVersion = process.env.NOTIFICATION_KEY_VERSION ?? 'v1';
  readonly keys: Record<string, string>;
  constructor() {
    if (!['disabled', 'smtp'].includes(this.driver))
      throw new Error('EMAIL_DRIVER must be disabled or smtp');
    const origin = new URL(this.webOrigin);
    if (
      origin.origin !== this.webOrigin ||
      origin.username ||
      origin.password ||
      !['http:', 'https:'].includes(origin.protocol)
    )
      throw new Error('WEB_ORIGIN must be an HTTP(S) origin without a path');
    if (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:')
      throw new Error('WEB_ORIGIN requires HTTPS in production');
    try {
      this.keys = JSON.parse(
        process.env.NOTIFICATION_DATA_KEYS ?? '{}',
      ) as Record<string, string>;
    } catch {
      throw new Error('Invalid NOTIFICATION_DATA_KEYS');
    }
    if (!this.keys || Array.isArray(this.keys) || typeof this.keys !== 'object')
      throw new Error('Invalid NOTIFICATION_DATA_KEYS');
    for (const [version, key] of Object.entries(this.keys))
      if (
        !/^[a-zA-Z0-9_-]{1,32}$/.test(version) ||
        typeof key !== 'string' ||
        Buffer.from(key, 'base64').length !== 32
      )
        throw new Error(
          'Notification keys must be named base64-encoded 32-byte keys',
        );
    if (this.driver === 'smtp' && !this.keys[this.keyVersion])
      throw new Error(
        'SMTP authentication emails require NOTIFICATION_DATA_KEYS and NOTIFICATION_KEY_VERSION',
      );
  }
}

import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { NotificationConfig } from './notification-config';
@Injectable()
export class NotificationSecret {
  constructor(readonly config: NotificationConfig) {}
  seal(token: string, tenantId: string, eventId: string) {
    const nonce = randomBytes(12),
      cipher = createCipheriv(
        'aes-256-gcm',
        Buffer.from(this.config.keys[this.config.keyVersion], 'base64'),
        nonce,
      );
    cipher.setAAD(Buffer.from(`${tenantId}/${eventId}`));
    const encrypted = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    return [
      this.config.keyVersion,
      nonce.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }
  open(value: string, tenantId: string, eventId: string) {
    const [version, nonce, tag, encrypted] = value.split('.');
    const key = this.config.keys[version];
    if (!key) throw new Error('Notification decryption key unavailable');
    const cipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(key, 'base64'),
      Buffer.from(nonce, 'base64'),
    );
    cipher.setAAD(Buffer.from(`${tenantId}/${eventId}`));
    cipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([
      cipher.update(Buffer.from(encrypted, 'base64')),
      cipher.final(),
    ]).toString('utf8');
  }
}

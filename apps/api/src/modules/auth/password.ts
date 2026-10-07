import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';

let activeDerivations = 0;
const derive = (password: string, salt: string): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    if (activeDerivations >= 4) {
      reject(
        new ServiceUnavailableException(
          'Authentication is busy. Try again shortly.',
        ),
      );
      return;
    }
    activeDerivations++;
    scrypt(
      password,
      salt,
      64,
      { N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 },
      (error, key) => {
        activeDerivations--;
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$131072$8$1$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(
  password: string,
  encoded: string | null,
): Promise<boolean> {
  const valid = /^scrypt\$131072\$8\$1\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(
    encoded ?? '',
  );
  const parts = valid ? encoded!.split('$') : [];
  const actual = await derive(
    password,
    parts[4] ?? '00000000000000000000000000000000',
  );
  const expected = Buffer.from(parts[5] ?? '00'.repeat(64), 'hex');
  return timingSafeEqual(actual, expected) && valid;
}
export const credentialHash = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

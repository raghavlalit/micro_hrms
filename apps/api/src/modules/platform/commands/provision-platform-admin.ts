// Explicit operator command; never imported by the API or called at startup.
import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import dataSource from '../../../database/data-source';
import { apiEnvPath } from '../../../database/database.options';
import { hashPassword } from '../../auth/password';
import { PlatformAdmin } from '../platform.schemas';

async function main(): Promise<void> {
  const email = (process.env.PLATFORM_ADMIN_EMAIL || 'microhrms@yopmail.com')
    .trim()
    .toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error('Invalid email');
  const supplied = process.env.PLATFORM_ADMIN_PASSWORD;
  if (supplied && (supplied.length < 15 || supplied.length > 128))
    throw new Error('Password must be 15-128 characters');
  if (process.env.NODE_ENV === 'production' && !supplied)
    throw new Error(
      'Set PLATFORM_ADMIN_PASSWORD through a secret manager in production',
    );
  const password = supplied || randomBytes(24).toString('base64url');
  await dataSource.initialize();
  try {
    await dataSource.transaction(async (manager) => {
      // PostgreSQL advisory lock serializes provisioning across operator processes.
      await manager.query(
        "SELECT pg_advisory_xact_lock(hashtext('provision-platform-admin'))",
      );
      const repository = manager.getRepository(PlatformAdmin);
      const existing = await repository
        .createQueryBuilder('admin')
        .select('admin.id')
        .where('lower(admin.email) = :email', { email })
        .getOne();
      if (existing) {
        console.log(
          'Administrator already exists; password and account state unchanged.',
        );
        return;
      }
      const hash = await hashPassword(password);
      const result = await repository.insert({
        email,
        password_hash: hash,
        must_change_password: true,
      });
      const id = String(result.identifiers[0].id);
      if (!supplied) {
        const directory = resolve(dirname(apiEnvPath), '../../.tmp');
        await mkdir(directory, { recursive: true });
        const path = resolve(directory, `platform-admin-${id}.txt`);
        await writeFile(
          path,
          `Email: ${email}\nTemporary password: ${password}\nChange this password at first login, then delete this file.\n`,
          { flag: 'wx', mode: 0o600 },
        );
        if (process.platform === 'win32')
          execFileSync(
            'icacls',
            [
              path,
              '/inheritance:r',
              '/grant:r',
              `${process.env.USERDOMAIN}\\${process.env.USERNAME}:(F)`,
            ],
            { stdio: 'ignore', windowsHide: true },
          );
        console.log(`Temporary credentials saved locally: ${path}`);
      }
      console.log(
        `Platform administrator created: ${email}. Password change required at first login.`,
      );
    });
  } finally {
    await dataSource.destroy();
  }
}
void main().catch(() => {
  console.error(
    'Administrator provisioning failed; check database connectivity, migrations and input settings.',
  );
  process.exitCode = 1;
});

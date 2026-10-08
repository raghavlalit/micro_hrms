import { Injectable, NotFoundException } from '@nestjs/common';
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
@Injectable()
export class PayslipStorage {
  readonly root = resolve(
    process.env.PAYSLIP_STORAGE_DIR ||
      resolve(__dirname, '../../../storage/payslips'),
  );
  private path(key: string) {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\.pdf$/.test(key))
      throw new NotFoundException('Payslip file unavailable');
    return resolve(this.root, ...key.split('/'));
  }
  async save(key: string, bytes: Buffer) {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    // Atomic rename prevents a partially written PDF from ever being published.
    const temporary = file + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    try {
      await rename(temporary, file);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException('Payslip file is missing; contact HR');
      throw error;
    }
  }
}

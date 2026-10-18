import {
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { mkdir, writeFile, rename, unlink, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
@Injectable()
export class ReportExportStorage {
  readonly root = resolve(
    process.env.REPORT_EXPORT_STORAGE_DIR ||
      resolve(__dirname, '../../../storage/report-exports'),
  );
  private path(key: string) {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.csv$/.test(key))
      throw new NotFoundException('Report file unavailable');
    return resolve(this.root, ...key.split('/'));
  }
  async save(key: string, content: string) {
    if (Buffer.byteLength(content, 'utf8') > 50 * 1024 * 1024)
      throw new PayloadTooLargeException('Report file exceeds 50 MiB');
    const file = this.path(key),
      temporary = file + '.' + randomUUID() + '.tmp';
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await rename(temporary, file);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }
  }
  async read(key: string) {
    try {
      return await readFile(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        throw new NotFoundException(
          'Report file unavailable; request a new export',
        );
      throw error;
    }
  }
  async remove(key: string) {
    try {
      await unlink(this.path(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
}

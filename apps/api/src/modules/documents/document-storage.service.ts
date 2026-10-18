import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';

@Injectable()
export class DocumentStorage {
  private readonly driver = process.env.DOCUMENT_STORAGE_DRIVER || 'local';
  private readonly root = resolve(
    process.env.DOCUMENT_STORAGE_DIR ||
      resolve(__dirname, '../../../storage/documents'),
  );
  private readonly bucket = process.env.DOCUMENT_S3_BUCKET;
  private readonly client?: S3Client;
  constructor() {
    if (!['local', 's3'].includes(this.driver))
      throw new Error('Invalid DOCUMENT_STORAGE_DRIVER');
    if (process.env.NODE_ENV === 'production' && this.driver !== 's3')
      throw new Error(
        'Production documents require DOCUMENT_STORAGE_DRIVER=s3',
      );
    if (this.driver === 's3') {
      if (!this.bucket) throw new Error('DOCUMENT_S3_BUCKET is required');
      this.client = new S3Client({
        region: process.env.DOCUMENT_S3_REGION || 'us-east-1',
        endpoint: process.env.DOCUMENT_S3_ENDPOINT || undefined,
        forcePathStyle: process.env.DOCUMENT_S3_FORCE_PATH_STYLE === 'true',
        maxAttempts: 2,
      });
    }
  }
  private validateKey(key: string) {
    if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/.test(key))
      throw new NotFoundException('Document file unavailable');
    return key;
  }
  async save(key: string, bytes: Buffer, mime: string) {
    this.validateKey(key);
    try {
      if (this.client)
        await this.client.send(
          new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: bytes,
            ContentType: mime,
            ContentDisposition: 'attachment',
            IfNoneMatch: '*',
            ServerSideEncryption: 'AES256',
          }),
        );
      else {
        const file = resolve(this.root, ...key.split('/'));
        await mkdir(dirname(file), { recursive: true, mode: 0o700 });
        await writeFile(file, bytes, { flag: 'wx', mode: 0o600 });
      }
    } catch {
      throw new ServiceUnavailableException(
        'Document storage is unavailable. Retry the upload.',
      );
    }
  }
  async read(key: string, checksum: string) {
    this.validateKey(key);
    try {
      let bytes: Buffer;
      if (this.client) {
        const result = await this.client.send(
          new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        );
        if (!result.ContentLength || result.ContentLength > 10 * 1024 * 1024)
          throw new Error('Invalid stored file size');
        bytes = Buffer.from(await result.Body!.transformToByteArray());
      } else bytes = await readFile(resolve(this.root, ...key.split('/')));
      if (createHash('sha256').update(bytes).digest('hex') !== checksum)
        throw new Error('Checksum mismatch');
      return bytes;
    } catch {
      throw new ServiceUnavailableException(
        'Document file is unavailable or failed its integrity check. Contact HR.',
      );
    }
  }
}

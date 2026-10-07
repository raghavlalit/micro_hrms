import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { EmployeePrivateData } from './employee.schemas';
import { EmployeePrivateDto, PrivateFieldDto } from './employee.dto';

@Injectable()
export class EmployeePrivateService {
  private keys() {
    try {
      const keys = JSON.parse(process.env.EMPLOYEE_DATA_KEYS ?? '{}') as Record<
        string,
        string
      >;
      const version = process.env.EMPLOYEE_DATA_KEY_VERSION ?? 'v1';
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(version) || !keys[version])
        throw new Error();
      for (const key of Object.values(keys))
        if (typeof key !== 'string' || Buffer.from(key, 'base64').length !== 32)
          throw new Error();
      return { keys, version };
    } catch {
      throw new ServiceUnavailableException(
        'Protected employee data is not configured. Contact your system administrator.',
      );
    }
  }
  available() {
    try {
      this.keys();
      return true;
    } catch {
      return false;
    }
  }
  private encrypt(value: PrivateFieldDto[], key: Buffer, context: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(context));
    const ciphertext = Buffer.concat([
      cipher.update(JSON.stringify(value), 'utf8'),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), ciphertext]
      .map((part) => part.toString('base64'))
      .join('.');
  }
  private decrypt(
    value: unknown,
    key: Buffer,
    context: string,
  ): PrivateFieldDto[] {
    if (!value) return [];
    try {
      if (typeof value !== 'string') throw new Error();
      const parts = value.split('.').map((part) => Buffer.from(part, 'base64'));
      if (parts.length !== 3) throw new Error();
      const cipher = createDecipheriv('aes-256-gcm', key, parts[0]);
      cipher.setAAD(Buffer.from(context));
      cipher.setAuthTag(parts[1]);
      return JSON.parse(
        Buffer.concat([cipher.update(parts[2]), cipher.final()]).toString(
          'utf8',
        ),
      ) as PrivateFieldDto[];
    } catch {
      throw new ServiceUnavailableException(
        'Protected employee data could not be read. Contact your system administrator.',
      );
    }
  }
  async read(manager: EntityManager, tenantId: string, employeeId: string) {
    const { keys } = this.keys();
    const row = await manager
      .getRepository(EmployeePrivateData)
      .findOneBy({ tenant_id: tenantId, employee_id: employeeId });
    if (!row) return { bank_details: [], statutory_identifiers: [] };
    const key = keys[String(row.encryption_key_version)];
    if (!key)
      throw new ServiceUnavailableException(
        'A required employee-data encryption key is unavailable',
      );
    return {
      bank_details: this.decrypt(
        row.bank_details_ciphertext,
        Buffer.from(key, 'base64'),
        `${tenantId}:${employeeId}:bank`,
      ),
      statutory_identifiers: this.decrypt(
        row.statutory_identifiers_ciphertext,
        Buffer.from(key, 'base64'),
        `${tenantId}:${employeeId}:statutory`,
      ),
    };
  }
  async save(
    manager: EntityManager,
    tenantId: string,
    employeeId: string,
    dto: EmployeePrivateDto,
  ) {
    const { keys, version } = this.keys();
    const key = Buffer.from(keys[version], 'base64');
    await manager
      .getRepository(EmployeePrivateData)
      .upsert(
        {
          tenant_id: tenantId,
          employee_id: employeeId,
          bank_details_ciphertext: this.encrypt(
            dto.bank_details,
            key,
            `${tenantId}:${employeeId}:bank`,
          ),
          statutory_identifiers_ciphertext: this.encrypt(
            dto.statutory_identifiers,
            key,
            `${tenantId}:${employeeId}:statutory`,
          ),
          encryption_key_version: version,
        },
        ['tenant_id', 'employee_id'],
      );
  }
}

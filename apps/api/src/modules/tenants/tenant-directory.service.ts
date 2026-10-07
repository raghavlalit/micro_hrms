import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class TenantDirectoryService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}
  async findActiveIdBySlug(slug: string): Promise<string | undefined> {
    // PostgreSQL security-definer lookup: runtime cannot enumerate tenants before login.
    // This is a database security primitive, not unrestricted tenant CRUD.
    const rows: { id: string | null }[] = await this.db.query(
      'SELECT public.auth_tenant_id($1) AS id',
      [slug],
    );
    return rows[0]?.id ?? undefined;
  }
}

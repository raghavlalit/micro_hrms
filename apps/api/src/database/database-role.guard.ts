import { Injectable } from '@nestjs/common';
import type { OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabaseRoleGuard implements OnModuleInit {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const [role]: { unsafe: boolean }[] = await this.dataSource.query(`
      SELECT (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR EXISTS (
        SELECT 1 FROM pg_class c
        WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'r'
          AND pg_has_role(current_user, c.relowner, 'USAGE')
      )) AS unsafe
      FROM pg_roles r WHERE r.rolname = current_user
    `);
    if (!role || role.unsafe) {
      throw new Error(
        'DATABASE_URL must use a restricted non-owner role without superuser, BYPASSRLS, role-creation or database-creation privileges.',
      );
    }
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';
export class EmployeeManagement1791350000000 implements MigrationInterface {
  name = 'EmployeeManagement1791350000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    // Existing tenant RLS still applies; subscription limits remain operator-owned.
    await queryRunner.query(
      'GRANT UPDATE (active_employee_count) ON tenants TO microhrms_app',
    );
    await queryRunner.query(
      'CREATE UNIQUE INDEX uq_employees_tenant_email ON employees (tenant_id, lower(email)) WHERE email IS NOT NULL',
    );
    await queryRunner.query(`UPDATE tenants SET active_employee_count = (
      SELECT count(*) FROM employees WHERE employees.tenant_id = tenants.id
        AND employees.status IN ('active', 'on_notice') AND employees.archived_at IS NULL
    )`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX uq_employees_tenant_email');
    await queryRunner.query(
      'REVOKE UPDATE (active_employee_count) ON tenants FROM microhrms_app',
    );
  }
}

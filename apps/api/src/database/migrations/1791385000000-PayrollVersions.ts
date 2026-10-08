import { MigrationInterface, QueryRunner, TableUnique } from 'typeorm';
export class PayrollVersions1791385000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(
      'ALTER TABLE payroll_runs ADD COLUMN calculation_version integer NOT NULL DEFAULT 0',
    );
    await runner.query(
      'ALTER TABLE payroll_employees ADD COLUMN calculation_version integer NOT NULL DEFAULT 1',
    );
    // Backfill existing snapshots only; normal writes retain the immutable-payroll guard.
    await runner.query(
      'ALTER TABLE payroll_runs DISABLE TRIGGER locked_payroll_guard',
    );
    await runner.query(
      'UPDATE payroll_runs r SET calculation_version = 1 WHERE EXISTS (SELECT 1 FROM payroll_employees e WHERE e.payroll_run_id = r.id AND e.tenant_id = r.tenant_id)',
    );
    await runner.query(
      'ALTER TABLE payroll_runs ENABLE TRIGGER locked_payroll_guard',
    );
    const table = await runner.getTable('payroll_employees');
    const old = table!.uniques.find(
      (item) =>
        item.columnNames.length === 3 &&
        item.columnNames.includes('payroll_run_id') &&
        item.columnNames.includes('employee_id'),
    )!;
    await runner.dropUniqueConstraint('payroll_employees', old);
    await runner.createUniqueConstraint(
      'payroll_employees',
      new TableUnique({
        name: 'uq_payroll_employee_calculation',
        columnNames: [
          'tenant_id',
          'payroll_run_id',
          'employee_id',
          'calculation_version',
        ],
      }),
    );
    await runner.query('GRANT UPDATE (settings) ON tenants TO microhrms_app');
  }
  async down(runner: QueryRunner) {
    const duplicates = (await runner.query(
      'SELECT 1 FROM payroll_employees GROUP BY tenant_id,payroll_run_id,employee_id HAVING count(*)>1 LIMIT 1',
    )) as unknown[];
    if (duplicates.length)
      throw new Error(
        'Cannot roll back versioned payroll without losing history; use a forward migration',
      );
    await runner.dropUniqueConstraint(
      'payroll_employees',
      'uq_payroll_employee_calculation',
    );
    await runner.createUniqueConstraint(
      'payroll_employees',
      new TableUnique({
        columnNames: ['tenant_id', 'payroll_run_id', 'employee_id'],
      }),
    );
    await runner.query(
      'ALTER TABLE payroll_employees DROP COLUMN calculation_version',
    );
    await runner.query(
      'ALTER TABLE payroll_runs DROP COLUMN calculation_version',
    );
    await runner.query(
      'REVOKE UPDATE (settings) ON tenants FROM microhrms_app',
    );
  }
}

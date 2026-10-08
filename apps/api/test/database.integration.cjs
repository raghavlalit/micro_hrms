/* Real PostgreSQL verification. Creates and drops ONLY its own randomly named database. */
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { DataSource } = require('typeorm');
const { databaseOptions } = require('../dist/database/database.options');
const {
  TenantDatabaseService,
} = require('../dist/modules/tenants/tenant-database.service');

async function main() {
  const migrationOptions = databaseOptions(true);
  const runtimeOptions = databaseOptions();
  const adminUrl = new URL(migrationOptions.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname))
    throw new Error('Integration tests require a local PostgreSQL host.');
  const database = `microhrms_test_${randomBytes(8).toString('hex')}`;
  const testUrl = new URL(adminUrl);
  testUrl.pathname = `/${database}`;
  const appUrl = new URL(runtimeOptions.url);
  appUrl.pathname = `/${database}`;
  const admin = new DataSource({ ...migrationOptions, logging: false });
  let migration,
    runtime,
    created = false;
  let assertions = 0;
  const pass = (name) => {
    assertions++;
    console.log(`PASS ${name}`);
  };
  async function fails(work, code, name) {
    await assert.rejects(
      work,
      (error) => error.code === code || error.driverError?.code === code,
    );
    pass(name);
  }
  try {
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    migration = new DataSource({
      ...migrationOptions,
      url: testUrl.toString(),
      logging: false,
    });
    await migration.initialize();
    assert.equal((await migration.runMigrations()).length, 8);
    pass('fresh migrations apply');
    assert.equal((await migration.runMigrations()).length, 0);
    pass('re-running migrations is a no-op');
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    assert.equal((await migration.runMigrations()).length, 2);
    pass('security rollback and reapply retain reference data safely');
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    await migration.undoLastMigration();
    const remaining = await migration.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'schema_migrations'",
    );
    assert.equal(remaining.length, 0);
    pass('full rollback removes the application schema');
    await migration.runMigrations();
    const drift = await migration.driver.createSchemaBuilder().log();
    assert.equal(
      drift.upQueries.length,
      0,
      drift.upQueries.map((q) => q.query).join('\n'),
    );
    pass('entity metadata matches migrated schema');
    const policies = await migration.query(
      "SELECT count(*)::int AS total FROM pg_class WHERE relnamespace='public'::regnamespace AND relrowsecurity AND relforcerowsecurity",
    );
    assert.equal(policies[0].total, 37);
    pass('RLS enabled and forced on every tenant-owned table');

    const [a, b] = await migration.query(
      "INSERT INTO tenants (name,slug,status) VALUES ('Tenant A','tenant-a','active'),('Tenant B','tenant-b','active') RETURNING id",
    );
    const [userA] = await migration.query(
      "INSERT INTO users (tenant_id,email,display_name,status) VALUES ($1,'hr@example.test','HR','active') RETURNING id",
      [a.id],
    );
    const [departmentB] = await migration.query(
      "INSERT INTO departments (tenant_id,code,name) VALUES ($1,'ENG','Engineering') RETURNING id",
      [b.id],
    );
    const employeeSql =
      "INSERT INTO employees (tenant_id,employee_code,first_name,last_name,joining_date,employment_type,status) VALUES ($1,'EMP001','Test','Employee','2026-10-01','full_time','active') RETURNING id";
    const [employeeA] = await migration.query(employeeSql, [a.id]);
    const [employeeB] = await migration.query(employeeSql, [b.id]);
    pass('employee codes can repeat in different tenants');
    runtime = new DataSource({
      ...runtimeOptions,
      url: appUrl.toString(),
      logging: false,
    });
    await runtime.initialize();
    const tenantDb = new TenantDatabaseService(runtime);
    const scoped = (id, sql, values = []) =>
      tenantDb.withTenant(id, (manager) => manager.query(sql, values));
    assert.equal((await runtime.query('SELECT * FROM employees')).length, 0);
    pass('no tenant context returns no business data');
    assert.equal((await scoped(a.id, 'SELECT * FROM employees')).length, 1);
    pass('tenant A sees only its own employee');
    assert.equal(
      (
        await scoped(a.id, 'SELECT * FROM employees WHERE id=$1', [
          employeeB.id,
        ])
      ).length,
      0,
    );
    pass('cross-tenant ID lookup is hidden');
    assert.equal((await runtime.query('SELECT * FROM employees')).length, 0);
    pass('tenant context does not leak through pooled connections');
    const changed = await scoped(
      a.id,
      "UPDATE employees SET first_name='Changed' WHERE id=$1 RETURNING id",
      [employeeB.id],
    );
    assert.equal(changed[1], 0);
    pass('cross-tenant updates change no rows');
    await fails(
      () => scoped(a.id, employeeSql, [b.id]),
      '42501',
      'cross-tenant INSERT denied by RLS',
    );
    await fails(
      () =>
        scoped(a.id, 'UPDATE employees SET department_id=$1 WHERE id=$2', [
          departmentB.id,
          employeeA.id,
        ]),
      '23503',
      'composite foreign key rejects cross-tenant reference',
    );
    await fails(
      () => scoped(a.id, employeeSql, [a.id]),
      '23505',
      'duplicate employee code within tenant rejected',
    );
    await scoped(
      a.id,
      "INSERT INTO attendance (tenant_id,employee_id,work_date) VALUES ($1,$2,'2026-10-05')",
      [a.id, employeeA.id],
    );
    await fails(
      () =>
        scoped(
          a.id,
          "INSERT INTO attendance (tenant_id,employee_id,work_date) VALUES ($1,$2,'2026-10-05')",
          [a.id, employeeA.id],
        ),
      '23505',
      'duplicate employee day attendance rejected',
    );
    await fails(
      () =>
        scoped(
          a.id,
          'UPDATE attendance SET check_out=now() WHERE employee_id=$1',
          [employeeA.id],
        ),
      '23514',
      'checkout without checkin rejected',
    );
    await scoped(
      a.id,
      "INSERT INTO holidays (tenant_id,holiday_date,name) VALUES ($1,'2026-10-10','Holiday')",
      [a.id],
    );
    await fails(
      () =>
        scoped(
          a.id,
          "INSERT INTO holidays (tenant_id,holiday_date,name) VALUES ($1,'2026-10-10','Duplicate')",
          [a.id],
        ),
      '23505',
      'duplicate company-wide holiday rejected with null location',
    );
    const [leaveType] = await scoped(
      a.id,
      "INSERT INTO leave_types (tenant_id,code,name) VALUES ($1,'CL','Casual leave') RETURNING id",
      [a.id],
    );
    await fails(
      () =>
        scoped(
          a.id,
          "INSERT INTO leave_balances (tenant_id,employee_id,leave_type_id,period_start,period_end,credited,pending) VALUES ($1,$2,$3,'2026-01-01','2026-12-31',1,2)",
          [a.id, employeeA.id, leaveType.id],
        ),
      '23514',
      'overdrawn leave balance rejected',
    );
    await scoped(
      a.id,
      "INSERT INTO audit_logs (tenant_id,actor_id,action,entity_type) VALUES ($1,$2,'test','employee')",
      [a.id, userA.id],
    );
    await fails(
      () => scoped(a.id, "UPDATE audit_logs SET action='tampered'"),
      '42501',
      'runtime cannot edit audit history',
    );
    await fails(
      () => migration.query("UPDATE audit_logs SET action='tampered'"),
      '23514',
      'append-only trigger protects audit history',
    );
    await fails(
      () =>
        runtime.query(
          "INSERT INTO platform_admins (email,password_hash) VALUES ('unauthorized@example.test','invalid')",
        ),
      '42501',
      'runtime cannot create platform identities',
    );
    await fails(
      () => runtime.query('CREATE TABLE should_not_exist(id int)'),
      '42501',
      'runtime cannot create schema objects',
    );
    const [run] = await scoped(
      a.id,
      "INSERT INTO payroll_runs (tenant_id,period_start,period_end,currency,gross_total,deduction_total,net_total) VALUES ($1,'2026-10-01','2026-10-31','INR',0.30,0.10,0.20) RETURNING id,net_total",
      [a.id],
    );
    assert.equal(run.net_total, '0.20');
    pass('money remains exact decimal text rather than floating point');
    const [item] = await scoped(
      a.id,
      'INSERT INTO payroll_employees (tenant_id,payroll_run_id,employee_id) VALUES ($1,$2,$3) RETURNING id',
      [a.id, run.id, employeeA.id],
    );
    await scoped(
      a.id,
      "UPDATE payroll_runs SET status='locked',locked_at=now(),locked_by=$1 WHERE id=$2",
      [userA.id, run.id],
    );
    await fails(
      () =>
        scoped(a.id, "UPDATE payroll_runs SET status='draft' WHERE id=$1", [
          run.id,
        ]),
      '23514',
      'locked run cannot silently unlock',
    );
    await fails(
      () =>
        scoped(
          a.id,
          'UPDATE payroll_employees SET input_snapshot=$1 WHERE id=$2',
          ['{"changed":true}', item.id],
        ),
      '23514',
      'locked payroll snapshot cannot change',
    );
    await fails(
      () =>
        scoped(
          a.id,
          "INSERT INTO payroll_lines (tenant_id,payroll_employee_id,component_code,component_name,amount) VALUES ($1,$2,'BONUS','Bonus',100)",
          [a.id, item.id],
        ),
      '23514',
      'locked payroll cannot acquire new lines',
    );
    await scoped(
      a.id,
      'UPDATE payroll_runs SET published_at=now() WHERE id=$1',
      [run.id],
    );
    pass('locked payroll permits publication metadata');
    await migration.query("UPDATE tenants SET status='suspended' WHERE id=$1", [
      a.id,
    ]);
    await assert.rejects(
      () => scoped(a.id, 'SELECT * FROM employees'),
      /Tenant is not active/,
    );
    pass('tenant helper rejects suspended tenants');
    await assert.rejects(
      () => scoped('not-a-uuid', 'SELECT 1'),
      /Invalid tenant context/,
    );
    pass('tenant helper rejects invalid context');
    console.log(`Database integration checks passed: ${assertions}`);
  } finally {
    if (runtime?.isInitialized) await runtime.destroy();
    if (migration?.isInitialized) await migration.destroy();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (admin.isInitialized) await admin.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

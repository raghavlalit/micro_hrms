import type { MigrationInterface, QueryRunner } from 'typeorm';

// Frozen list: migrations must never import the changing entity registry.
const tenantTables = [
  'users',
  'roles',
  'user_roles',
  'role_permissions',
  'auth_tokens',
  'sessions',
  'departments',
  'designations',
  'locations',
  'work_schedules',
  'employees',
  'employee_private_data',
  'attendance',
  'attendance_regularizations',
  'holidays',
  'leave_types',
  'leave_policies',
  'employee_leave_policies',
  'leave_balances',
  'leave_requests',
  'leave_balance_entries',
  'salary_components',
  'salary_structures',
  'salary_structure_lines',
  'payroll_runs',
  'payroll_employees',
  'payroll_lines',
  'payslips',
  'document_categories',
  'documents',
  'document_versions',
  'notifications',
  'outbox_events',
  'export_jobs',
  'audit_logs',
  'support_access_grants',
];

export class TenantSecurity1791178103171 implements MigrationInterface {
  name = 'TenantSecurity1791178103171';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Provision this non-owner role outside migrations; never embed credentials here.
    await queryRunner.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'microhrms_app' AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole) THEN
        RAISE EXCEPTION 'Provision a non-superuser, non-BYPASSRLS microhrms_app role first';
      END IF;
    END $$`);
    await queryRunner.query('REVOKE CREATE ON SCHEMA public FROM PUBLIC');
    await queryRunner.query('GRANT USAGE ON SCHEMA public TO microhrms_app');
    for (const table of ['tenants', ...tenantTables]) {
      const column = table === 'tenants' ? 'id' : 'tenant_id';
      await queryRunner.query(
        `ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(`CREATE POLICY tenant_isolation ON "${table}" FOR ALL TO microhrms_app
        USING ("${column}" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
        WITH CHECK ("${column}" = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`);
      // Provisioning companies and authorizing operator support are separate trusted workflows.
      if (table === 'tenants' || table === 'support_access_grants') {
        await queryRunner.query(`GRANT SELECT ON "${table}" TO microhrms_app`);
      } else if (table === 'audit_logs' || table === 'leave_balance_entries') {
        await queryRunner.query(
          `GRANT SELECT, INSERT ON "${table}" TO microhrms_app`,
        );
      } else {
        await queryRunner.query(
          `GRANT SELECT, INSERT, UPDATE ON "${table}" TO microhrms_app`,
        );
      }
    }
    await queryRunner.query(
      'GRANT DELETE ON auth_tokens, sessions, user_roles, role_permissions, outbox_events, notifications, export_jobs TO microhrms_app',
    );
    await queryRunner.query(
      'GRANT SELECT ON subscription_plans, permissions TO microhrms_app',
    );
    await queryRunner.query(
      `INSERT INTO subscription_plans (code, name, employee_limit, user_limit) VALUES ('trial', 'Trial', 100, 100) ON CONFLICT (code) DO NOTHING`,
    );
    await queryRunner.query(`INSERT INTO permissions (code, description) VALUES
      ('company.manage', 'Manage company configuration'),
      ('employees.manage', 'Manage employee records'),
      ('employees.read.self', 'Read own employee profile'),
      ('employees.read.team', 'Read permitted team profiles'),
      ('attendance.manage', 'Manage company attendance'),
      ('attendance.self', 'Use own attendance workflows'),
      ('attendance.approve.team', 'Approve team attendance corrections'),
      ('leave.manage', 'Manage leave policies and company approvals'),
      ('leave.self', 'Use own leave workflows'),
      ('leave.approve.team', 'Approve permitted team leave'),
      ('payroll.manage', 'Manage payroll runs'),
      ('payslips.read.self', 'Read own published payslips'),
      ('documents.manage', 'Manage employee documents'),
      ('documents.read.self', 'Read explicitly permitted own documents'),
      ('reports.read.company', 'Read company reports'),
      ('reports.read.team', 'Read permitted team reports'),
      ('audit.read', 'Read tenant audit history'),
      ('roles.manage', 'Manage tenant role assignments') ON CONFLICT (code) DO NOTHING`);

    await queryRunner.query(`CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'History records are append-only' USING ERRCODE = '23514'; END;
    $$`);
    for (const table of ['audit_logs', 'leave_balance_entries']) {
      await queryRunner.query(`CREATE TRIGGER history_append_only BEFORE UPDATE OR DELETE ON "${table}"
        FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation()`);
    }
    await queryRunner.query(`CREATE FUNCTION protect_locked_payroll() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE run_status text;
      BEGIN
        IF TG_TABLE_NAME = 'payroll_runs' THEN
          IF OLD.status = 'locked' THEN
            IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Locked payroll is immutable' USING ERRCODE = '23514'; END IF;
            IF (to_jsonb(NEW) - 'published_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'published_at' - 'updated_at') THEN
              RAISE EXCEPTION 'Locked payroll is immutable' USING ERRCODE = '23514';
            END IF;
          END IF;
        ELSIF TG_TABLE_NAME = 'payroll_employees' THEN
          IF TG_OP <> 'INSERT' THEN
            SELECT status INTO run_status FROM payroll_runs WHERE tenant_id = OLD.tenant_id AND id = OLD.payroll_run_id FOR UPDATE;
            IF run_status = 'locked' THEN RAISE EXCEPTION 'Locked payroll is immutable' USING ERRCODE = '23514'; END IF;
          END IF;
          IF TG_OP <> 'DELETE' THEN
            SELECT status INTO run_status FROM payroll_runs WHERE tenant_id = NEW.tenant_id AND id = NEW.payroll_run_id FOR UPDATE;
            IF run_status = 'locked' THEN RAISE EXCEPTION 'Locked payroll is immutable' USING ERRCODE = '23514'; END IF;
          END IF;
        ELSE
          IF TG_OP <> 'INSERT' THEN
            SELECT r.status INTO run_status FROM payroll_runs r JOIN payroll_employees e
              ON e.tenant_id = r.tenant_id AND e.payroll_run_id = r.id
              WHERE e.tenant_id = OLD.tenant_id AND e.id = OLD.payroll_employee_id FOR UPDATE OF r;
            IF run_status = 'locked' THEN RAISE EXCEPTION 'Locked payroll is immutable' USING ERRCODE = '23514'; END IF;
          END IF;
          IF TG_OP <> 'DELETE' THEN
            SELECT r.status INTO run_status FROM payroll_runs r JOIN payroll_employees e
              ON e.tenant_id = r.tenant_id AND e.payroll_run_id = r.id
              WHERE e.tenant_id = NEW.tenant_id AND e.id = NEW.payroll_employee_id FOR UPDATE OF r;
            IF run_status = 'locked' THEN RAISE EXCEPTION 'Locked payroll is immutable' USING ERRCODE = '23514'; END IF;
          END IF;
        END IF;
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END;
    $$`);
    await queryRunner.query(
      'CREATE TRIGGER locked_payroll_guard BEFORE UPDATE OR DELETE ON payroll_runs FOR EACH ROW EXECUTE FUNCTION protect_locked_payroll()',
    );
    for (const table of ['payroll_employees', 'payroll_lines']) {
      await queryRunner.query(
        `CREATE TRIGGER locked_payroll_guard BEFORE INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION protect_locked_payroll()`,
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['payroll_runs', 'payroll_employees', 'payroll_lines'])
      await queryRunner.query(
        `DROP TRIGGER locked_payroll_guard ON "${table}"`,
      );
    await queryRunner.query('DROP FUNCTION protect_locked_payroll()');
    for (const table of ['audit_logs', 'leave_balance_entries'])
      await queryRunner.query(`DROP TRIGGER history_append_only ON "${table}"`);
    await queryRunner.query('DROP FUNCTION prevent_history_mutation()');
    for (const table of ['tenants', ...tenantTables]) {
      await queryRunner.query(`REVOKE ALL ON "${table}" FROM microhrms_app`);
      await queryRunner.query(`DROP POLICY tenant_isolation ON "${table}"`);
      await queryRunner.query(
        `ALTER TABLE "${table}" NO FORCE ROW LEVEL SECURITY`,
      );
      await queryRunner.query(
        `ALTER TABLE "${table}" DISABLE ROW LEVEL SECURITY`,
      );
    }
    await queryRunner.query(
      'REVOKE SELECT ON subscription_plans, permissions FROM microhrms_app',
    );
    // Reference data is retained on a security-only rollback. Full schema rollback removes it.
  }
}

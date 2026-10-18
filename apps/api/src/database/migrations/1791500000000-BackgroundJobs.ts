import {
  DefaultNamingStrategy,
  MigrationInterface,
  QueryRunner,
} from 'typeorm';
export class BackgroundJobs1791500000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`CREATE TABLE background_jobs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
      requested_by uuid NOT NULL, kind text NOT NULL, resource_id uuid, request_key text NOT NULL, request_hash text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}', result jsonb NOT NULL DEFAULT '{}', status varchar(32) NOT NULL DEFAULT 'pending',
      attempts integer NOT NULL DEFAULT 0, completed_units integer NOT NULL DEFAULT 0, total_units integer NOT NULL DEFAULT 0,
      error_code text, lease_token uuid, available_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz,
      completed_at timestamptz, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT uq_background_jobs_tenant_id UNIQUE(tenant_id,id),
      CONSTRAINT "${new DefaultNamingStrategy().foreignKeyName('background_jobs', ['tenant_id'], 'tenants', ['id'])}" FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE RESTRICT,
      CONSTRAINT uq_background_jobs_tenant_id_kind_request_key UNIQUE(tenant_id,kind,request_key),
      CONSTRAINT fk_background_jobs_requested_by FOREIGN KEY(tenant_id,requested_by) REFERENCES users(tenant_id,id) ON DELETE RESTRICT,
      CONSTRAINT ck_background_job_kind CHECK(kind IN ('payslips','report_export')),
      CONSTRAINT ck_background_job_status CHECK(status IN ('pending','running','completed','failed','expired'))
    )`);
    await runner.query(
      'CREATE INDEX ix_background_jobs_tenant_id_requested_by_created_at ON background_jobs(tenant_id,requested_by,created_at)',
    );
    await runner.query(
      'CREATE INDEX ix_background_jobs_status_available_at ON background_jobs(status,available_at)',
    );
    await runner.query('ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY');
    await runner.query('ALTER TABLE background_jobs FORCE ROW LEVEL SECURITY');
    const scope =
      "tenant_id = NULLIF(current_setting('app.tenant_id',true),'')::uuid";
    await runner.query(
      `CREATE POLICY tenant_isolation ON background_jobs TO microhrms_app USING (${scope}) WITH CHECK (${scope})`,
    );
    await runner.query(
      'GRANT SELECT,INSERT,UPDATE ON background_jobs TO microhrms_app',
    );
    await runner.query(
      `DO $$ BEGIN EXECUTE format('CREATE POLICY background_dispatch_owner ON background_jobs FOR SELECT TO %I USING (true)',current_user); END $$`,
    );
    // The prior notification migration supplies the owner-only tenant SELECT policy.
    await runner.query(`CREATE VIEW background_job_candidates WITH (security_barrier=true) AS
      SELECT job.id,job.tenant_id,job.available_at FROM background_jobs job JOIN tenants tenant ON tenant.id=job.tenant_id
      WHERE tenant.status IN ('active','trial') AND tenant.archived_at IS NULL AND
      ((job.status IN ('pending','running') AND job.available_at<=now()) OR (job.status='completed' AND job.expires_at<=now()))`);
    await runner.query('REVOKE ALL ON background_job_candidates FROM PUBLIC');
    await runner.query(
      'GRANT SELECT ON background_job_candidates TO microhrms_app',
    );
  }
  async down(runner: QueryRunner) {
    await runner.query('DROP VIEW background_job_candidates');
    await runner.query('DROP TABLE background_jobs');
  }
}

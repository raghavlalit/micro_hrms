import { MigrationInterface, QueryRunner } from 'typeorm';
export class LeaveAssignmentJobs1791600000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`ALTER TABLE background_jobs DROP CONSTRAINT ck_background_job_kind, DROP CONSTRAINT ck_background_job_status,
      ADD CONSTRAINT ck_background_job_kind CHECK (kind IN ('payslips','report_export','leave_assignment')),
      ADD CONSTRAINT ck_background_job_status CHECK (status IN ('draft','pending','running','completed','failed','expired'))`);
  }
  async down(runner: QueryRunner) {
    // Refuse destructive rollback if assignment job history exists.
    await runner.query(`ALTER TABLE background_jobs DROP CONSTRAINT ck_background_job_kind, DROP CONSTRAINT ck_background_job_status,
      ADD CONSTRAINT ck_background_job_kind CHECK (kind IN ('payslips','report_export')),
      ADD CONSTRAINT ck_background_job_status CHECK (status IN ('pending','running','completed','failed','expired'))`);
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';
export class DocumentManagement1791440000000 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(
      'ALTER TABLE documents ADD COLUMN revision uuid NOT NULL DEFAULT gen_random_uuid()',
    );
    await runner.query(
      "INSERT INTO permissions(code, description) VALUES ('documents.read.team', 'Read explicitly shared documents of direct reports') ON CONFLICT(code) DO NOTHING",
    );
    await runner.query(`CREATE FUNCTION protect_document_version() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF (to_jsonb(NEW) - 'archived_at' - 'updated_at') IS DISTINCT FROM (to_jsonb(OLD) - 'archived_at' - 'updated_at') THEN
          RAISE EXCEPTION 'Document version contents are immutable';
        END IF;
        RETURN NEW;
      END $$`);
    await runner.query(
      'CREATE TRIGGER immutable_document_version BEFORE UPDATE ON document_versions FOR EACH ROW EXECUTE FUNCTION protect_document_version()',
    );
  }
  async down(runner: QueryRunner) {
    await runner.query(
      'DROP TRIGGER immutable_document_version ON document_versions',
    );
    await runner.query('DROP FUNCTION protect_document_version()');
    await runner.query('ALTER TABLE documents DROP COLUMN revision');
    // Keep the global permission: existing tenant role assignments may reference it.
  }
}

import { MigrationInterface, QueryRunner } from 'typeorm';
export class DocumentManagementGrants1791440000001 implements MigrationInterface {
  async up(runner: QueryRunner) {
    // Existing document managers already read every company document. Add the
    // narrower permission so their existing role administrators can delegate it.
    await runner.query(`WITH granted AS (
      INSERT INTO role_permissions(tenant_id, role_id, permission_code)
      SELECT tenant_id, role_id, 'documents.read.team'
      FROM role_permissions WHERE permission_code = 'documents.manage'
      ON CONFLICT (tenant_id, role_id, permission_code) DO NOTHING
      RETURNING tenant_id, role_id
    )
    INSERT INTO audit_logs(tenant_id, action, entity_type, entity_id, metadata)
    SELECT tenant_id, 'role.document_team_permission_added', 'role', role_id,
      '{"source":"DocumentManagementGrants1791440000001","permission":"documents.read.team","reason":"Equivalent read permission for existing document managers"}'::jsonb
    FROM granted`);
  }
  down() {
    // Do not revoke a grant subsequently used/customized by HR or erase its audit.
    return Promise.resolve();
  }
}

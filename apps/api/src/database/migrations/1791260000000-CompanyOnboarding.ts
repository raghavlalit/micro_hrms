import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyOnboarding1791260000000 implements MigrationInterface {
  name = 'CompanyOnboarding1791260000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Platform access is limited to the company catalog. HR tables retain tenant RLS.
    await queryRunner.query(`CREATE FUNCTION public.platform_session_valid() RETURNS boolean
      LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
        SELECT EXISTS (
          SELECT 1 FROM public.platform_sessions s
          JOIN public.platform_admins a ON a.id = s.platform_admin_id
          WHERE s.credential_hash = current_setting('app.platform_session_hash', true)
            AND s.revoked_at IS NULL AND s.expires_at > now()
            AND a.disabled_at IS NULL AND NOT a.must_change_password
        )
      $$`);
    await queryRunner.query(
      'REVOKE ALL ON FUNCTION public.platform_session_valid() FROM PUBLIC',
    );
    await queryRunner.query(
      'GRANT EXECUTE ON FUNCTION public.platform_session_valid() TO microhrms_app',
    );
    await queryRunner.query('DROP POLICY tenant_isolation ON tenants');
    const tenantScope =
      "id = NULLIF(current_setting('app.tenant_id', true), '')::uuid";
    await queryRunner.query(
      `CREATE POLICY tenant_isolation ON tenants FOR SELECT TO microhrms_app USING (${tenantScope})`,
    );
    await queryRunner.query(
      `CREATE POLICY tenant_settings_update ON tenants FOR UPDATE TO microhrms_app USING (${tenantScope}) WITH CHECK (${tenantScope})`,
    );
    await queryRunner.query(
      'CREATE POLICY platform_catalog_read ON tenants FOR SELECT TO microhrms_app USING (public.platform_session_valid())',
    );
    await queryRunner.query(
      'CREATE POLICY platform_company_create ON tenants FOR INSERT TO microhrms_app WITH CHECK (public.platform_session_valid())',
    );
    await queryRunner.query('GRANT INSERT ON tenants TO microhrms_app');
    // Company admins cannot change subscription limits, slug, status or onboarding metadata.
    await queryRunner.query(
      'GRANT UPDATE (name, timezone, currency, date_format, contact_email, contact_phone, address, updated_at) ON tenants TO microhrms_app',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'REVOKE INSERT, UPDATE (name, timezone, currency, date_format, contact_email, contact_phone, address, updated_at) ON tenants FROM microhrms_app',
    );
    for (const policy of [
      'platform_company_create',
      'platform_catalog_read',
      'tenant_settings_update',
      'tenant_isolation',
    ]) {
      await queryRunner.query(`DROP POLICY ${policy} ON tenants`);
    }
    await queryRunner.query(`CREATE POLICY tenant_isolation ON tenants FOR ALL TO microhrms_app
      USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
      WITH CHECK (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)`);
    await queryRunner.query('DROP FUNCTION public.platform_session_valid()');
  }
}

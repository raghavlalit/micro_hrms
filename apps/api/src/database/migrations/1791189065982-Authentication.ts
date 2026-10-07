import { MigrationInterface, QueryRunner } from 'typeorm';

export class Authentication1791189065982 implements MigrationInterface {
  name = 'Authentication1791189065982';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE FUNCTION public.auth_tenant_id(company_slug text) RETURNS uuid
          LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
            SELECT id FROM public.tenants WHERE slug = company_slug AND status IN ('active', 'trial') AND archived_at IS NULL
          $$`);
    await queryRunner.query(
      `REVOKE ALL ON FUNCTION public.auth_tenant_id(text) FROM PUBLIC`,
    );
    await queryRunner.query(
      `GRANT EXECUTE ON FUNCTION public.auth_tenant_id(text) TO microhrms_app`,
    );
    await queryRunner.query(
      `CREATE TABLE "platform_sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "platform_admin_id" uuid NOT NULL, "credential_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_e5b2062e19a86bd91e2174443b1" UNIQUE ("credential_hash"), CONSTRAINT "PK_76bf34c31618cf39430b131a332" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f113a14a3b5bdc20edc655a76e" ON "platform_sessions" ("platform_admin_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_rate_limits" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "key" text NOT NULL, "attempts" integer NOT NULL DEFAULT '0', "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_757a482934f0e4bbacfe58d9dad" UNIQUE ("key"), CONSTRAINT "PK_c90ee53e4c13e4c3f61d4f97da0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_admins" ADD "must_change_password" boolean NOT NULL DEFAULT true`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_sessions" ADD CONSTRAINT "FK_f113a14a3b5bdc20edc655a76e7" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(`GRANT SELECT ON platform_admins TO microhrms_app`);
    await queryRunner.query(
      `GRANT UPDATE (password_hash, must_change_password, updated_at) ON platform_admins TO microhrms_app`,
    );
    await queryRunner.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON platform_sessions, auth_rate_limits TO microhrms_app`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP FUNCTION public.auth_tenant_id(text)`);
    await queryRunner.query(
      `REVOKE SELECT, UPDATE (password_hash, must_change_password, updated_at) ON platform_admins FROM microhrms_app`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_sessions" DROP CONSTRAINT "FK_f113a14a3b5bdc20edc655a76e7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "platform_admins" DROP COLUMN "must_change_password"`,
    );
    await queryRunner.query(`DROP TABLE "auth_rate_limits"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f113a14a3b5bdc20edc655a76e"`,
    );
    await queryRunner.query(`DROP TABLE "platform_sessions"`);
  }
}

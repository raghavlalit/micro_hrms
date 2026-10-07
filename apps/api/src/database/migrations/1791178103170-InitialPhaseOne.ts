import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialPhaseOne1791178103170 implements MigrationInterface {
  name = 'InitialPhaseOne1791178103170';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "subscription_plans" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" text NOT NULL, "name" text NOT NULL, "employee_limit" integer NOT NULL DEFAULT '100', "user_limit" integer NOT NULL DEFAULT '100', "entitlements" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2d2df70a81d37c893ef216caf8a" UNIQUE ("code"), CONSTRAINT "CHK_346d67e1ac2c99048357c73e66" CHECK (employee_limit > 0 AND user_limit > 0), CONSTRAINT "PK_9ab8fe6918451ab3d0a4fb6bb0c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "tenants" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "name" text NOT NULL, "slug" text NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'trial', "timezone" text NOT NULL DEFAULT 'Asia/Kolkata', "currency" character varying(3) NOT NULL DEFAULT 'INR', "date_format" text NOT NULL DEFAULT 'dd/MM/yyyy', "contact_email" text, "contact_phone" text, "address" jsonb NOT NULL DEFAULT '{}'::jsonb, "logo_object_key" text, "plan_code" text NOT NULL DEFAULT 'trial', "trial_starts_at" TIMESTAMP WITH TIME ZONE, "trial_ends_at" TIMESTAMP WITH TIME ZONE, "employee_limit" integer NOT NULL DEFAULT '100', "user_limit" integer NOT NULL DEFAULT '100', "active_employee_count" integer NOT NULL DEFAULT '0', "settings" jsonb NOT NULL DEFAULT '{}'::jsonb, "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_2310ecc5cb8be427097154b18fc" UNIQUE ("slug"), CONSTRAINT "CHK_7c1a3c9e3de1174ac068de2c74" CHECK (status IN ('trial','active','suspended','closed')), CONSTRAINT "CHK_02a088a6c71d61000395053e83" CHECK (slug = lower(slug) AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), CONSTRAINT "CHK_ee5a2ea5166e44b1576db4fffe" CHECK (employee_limit > 0 AND user_limit > 0 AND active_employee_count >= 0), CONSTRAINT "CHK_c65d49db27224775f0b3743b8d" CHECK (trial_ends_at IS NULL OR trial_ends_at >= trial_starts_at), CONSTRAINT "PK_53be67a04681c66b87ee27c9321" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "email" text NOT NULL, "display_name" text NOT NULL, "password_hash" text, "status" character varying(32) NOT NULL DEFAULT 'invited', "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_users_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_e9f4c2efab52114c4e99e28efb1" UNIQUE ("tenant_id", "email"), CONSTRAINT "CHK_bd685bc10179aff5f5e9b79bfb" CHECK (email = lower(email)), CONSTRAINT "CHK_6a2cfa5a7aaa0f4547525b323b" CHECK (status IN ('invited','active','disabled')), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "code" text NOT NULL, "name" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_roles_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_3742e5465d865991e445c465437" UNIQUE ("tenant_id", "code"), CONSTRAINT "PK_c1433d71a4838793a49dcad46ab" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "permissions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "code" text NOT NULL, "description" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_8dad765629e83229da6feda1c1d" UNIQUE ("code"), CONSTRAINT "PK_920331560282b8bd21bb02290df" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_roles" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "role_id" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_user_roles_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_1b8d5bcdafc0a5a35d4dc86d8e6" UNIQUE ("tenant_id", "user_id", "role_id"), CONSTRAINT "PK_8acd5cf26ebd158416f477de799" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "role_permissions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "role_id" uuid NOT NULL, "permission_code" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_role_permissions_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_3ab2ff0f4d54ee6846c8fa8e351" UNIQUE ("tenant_id", "role_id", "permission_code"), CONSTRAINT "PK_84059017c90bfcb701b8fa42297" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "auth_tokens" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "purpose" character varying(32) NOT NULL DEFAULT 'invitation', "token_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "consumed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_auth_tokens_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_9e7509f95c30c33e84173b9c715" UNIQUE ("tenant_id", "token_hash"), CONSTRAINT "CHK_6c9053b0859c3bd4f8ff2246ae" CHECK (purpose IN ('invitation','password_reset','email_verification')), CONSTRAINT "PK_41e9ddfbb32da18c4e85e45c2fd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e9b85314da14c6592fbabcab0b" ON "auth_tokens" ("tenant_id", "user_id", "purpose") `,
    );
    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "user_id" uuid NOT NULL, "credential_hash" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_sessions_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_955a65a59ca5c933a2a5300a2ed" UNIQUE ("tenant_id", "credential_hash"), CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_32a6ac85a3a94e9d0ff397ab91" ON "sessions" ("tenant_id", "user_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "departments" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "name" text NOT NULL, "code" text NOT NULL, "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_departments_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_234404e89dcee2068b8a6d7dcfd" UNIQUE ("tenant_id", "code"), CONSTRAINT "PK_839517a681a86bb84cbcc6a1e9d" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "designations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "name" text NOT NULL, "code" text NOT NULL, "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_designations_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_e9d219ba4c946402193f9c95c8a" UNIQUE ("tenant_id", "code"), CONSTRAINT "PK_a0f024b99b1491a03fc421858ea" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "locations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "name" text NOT NULL, "code" text NOT NULL, "address" jsonb NOT NULL DEFAULT '{}'::jsonb, "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_locations_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_814485642794351ea8ffb1f2406" UNIQUE ("tenant_id", "code"), CONSTRAINT "PK_7cc1c9e3853b94816c094825e74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "work_schedules" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "name" text NOT NULL, "location_id" uuid, "working_days" smallint array NOT NULL DEFAULT ARRAY[1,2,3,4,5]::smallint[], "start_time" TIME NOT NULL DEFAULT '09:00', "end_time" TIME NOT NULL DEFAULT '18:00', "late_grace_minutes" integer NOT NULL DEFAULT '15', "half_day_minutes" integer NOT NULL DEFAULT '240', "full_day_minutes" integer NOT NULL DEFAULT '480', "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_work_schedules_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_382addcdabce174db924370fcf1" UNIQUE ("tenant_id", "name"), CONSTRAINT "CHK_9d09dbc1f77ce2deb74a406d94" CHECK (working_days <@ ARRAY[0,1,2,3,4,5,6]::smallint[] AND cardinality(working_days) > 0), CONSTRAINT "CHK_7d40db8272955d20f3370cb9f8" CHECK (late_grace_minutes >= 0 AND half_day_minutes > 0 AND full_day_minutes >= half_day_minutes), CONSTRAINT "PK_f5251879700e5ca0d2e353fa34f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "employees" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "user_id" uuid, "employee_code" text NOT NULL, "first_name" text NOT NULL, "last_name" text NOT NULL, "date_of_birth" date, "email" text, "phone" text, "address" jsonb NOT NULL DEFAULT '{}'::jsonb, "emergency_contact" jsonb NOT NULL DEFAULT '{}'::jsonb, "joining_date" date NOT NULL, "employment_type" text NOT NULL, "department_id" uuid, "designation_id" uuid, "location_id" uuid, "manager_id" uuid, "work_schedule_id" uuid, "probation_ends_on" date, "notice_date" date, "termination_date" date, "status" character varying(32) NOT NULL DEFAULT 'invited', "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_employees_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_9570aadbecd5191bd6500572dcf" UNIQUE ("tenant_id", "employee_code"), CONSTRAINT "UQ_ba177570d81e3749b86ec2fb7c5" UNIQUE ("tenant_id", "user_id"), CONSTRAINT "CHK_f646f00c99e500537aef33fb3e" CHECK (status IN ('invited','active','on_notice','inactive','terminated')), CONSTRAINT "CHK_068064c6cf7fd1334f7d8a66a9" CHECK (manager_id IS NULL OR manager_id <> id), CONSTRAINT "CHK_798536799de1e21203c905124a" CHECK (termination_date IS NULL OR termination_date >= joining_date), CONSTRAINT "PK_b9535a98350d5b26e7eb0c26af4" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a8ac83ca3562eb5bdd1b69bc10" ON "employees" ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_558c936c28b259fa3cb8106ebd" ON "employees" ("tenant_id", "manager_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f94168a407b98d43c6d682bba8" ON "employees" ("tenant_id", "department_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_87b52eb89d6e25f8a643a9027d" ON "employees" ("tenant_id", "location_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_private_data" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "bank_details_ciphertext" text, "statutory_identifiers_ciphertext" text, "encryption_key_version" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_employee_private_data_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_4c0335f25af6870999850d2d112" UNIQUE ("tenant_id", "employee_id"), CONSTRAINT "PK_88c59b5d92efd5e07025518d272" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "attendance" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "work_date" date NOT NULL, "check_in" TIMESTAMP WITH TIME ZONE, "check_out" TIMESTAMP WITH TIME ZONE, "worked_minutes" integer NOT NULL DEFAULT '0', "status" character varying(32) NOT NULL DEFAULT 'pending', "source" character varying(32) NOT NULL DEFAULT 'web', "source_metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_attendance_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_9af34ae8d874ee3f723e154205e" UNIQUE ("tenant_id", "employee_id", "work_date"), CONSTRAINT "CHK_f423f2c55ea888735d0e2ac36f" CHECK (worked_minutes >= 0), CONSTRAINT "CHK_dc24655c46b961ceb3d96b6790" CHECK (check_out IS NULL OR (check_in IS NOT NULL AND check_out >= check_in)), CONSTRAINT "CHK_1c1f41c4e40e1eeffab7f9dc10" CHECK (status IN ('present','absent','half_day','leave','holiday','weekly_off','pending','incomplete')), CONSTRAINT "PK_ee0ffe42c1f1a01e72b725c0cb2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ede922b422cdf4535511597c0c" ON "attendance" ("tenant_id", "work_date", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "attendance_regularizations" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "work_date" date NOT NULL, "requested_check_in" TIMESTAMP WITH TIME ZONE, "requested_check_out" TIMESTAMP WITH TIME ZONE, "reason" text NOT NULL, "original_values" jsonb NOT NULL DEFAULT '{}'::jsonb, "status" character varying(32) NOT NULL DEFAULT 'pending', "reviewer_id" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "review_comment" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_attendance_regularizations_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "CHK_020b4ebfcbb9f6f99d9d55f223" CHECK (status IN ('pending','approved','rejected')), CONSTRAINT "CHK_7ffe04ed18120f90f5b7a8d18b" CHECK (length(trim(reason)) > 0), CONSTRAINT "CHK_c6c6b1ec4a1d9e9d996dea7f7b" CHECK (requested_check_out IS NULL OR (requested_check_in IS NOT NULL AND requested_check_out >= requested_check_in)), CONSTRAINT "PK_4d999fbfe37065199d69ed89371" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_cdf62c60d4d18d6612644192dd" ON "attendance_regularizations" ("tenant_id", "status", "work_date") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_76344da1629dc6e2658514b6ac" ON "attendance_regularizations" ("tenant_id", "employee_id", "work_date") WHERE status = 'pending'`,
    );
    await queryRunner.query(
      `CREATE TABLE "holidays" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "holiday_date" date NOT NULL, "name" text NOT NULL, "description" text, "location_id" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_holidays_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "PK_3646bdd4c3817d954d830881dfe" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_a959396af79cc4e53a7905e4ac" ON "holidays" ("tenant_id", "holiday_date") WHERE location_id IS NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_fd0ca2316a42556ce05a3bfbd5" ON "holidays" ("tenant_id", "location_id", "holiday_date") WHERE location_id IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_types" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "code" text NOT NULL, "name" text NOT NULL, "description" text, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_leave_types_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_add551e0d5028a94e9c4318c47a" UNIQUE ("tenant_id", "code"), CONSTRAINT "PK_359223e0755d19711813cd07394" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_policies" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "leave_type_id" uuid NOT NULL, "name" text NOT NULL, "annual_entitlement" numeric(18,2) NOT NULL DEFAULT '0', "is_paid" boolean NOT NULL DEFAULT true, "balance_controlled" boolean NOT NULL DEFAULT true, "carry_forward_enabled" boolean NOT NULL DEFAULT false, "exclude_non_working_days" boolean NOT NULL DEFAULT true, "applicability" jsonb NOT NULL DEFAULT '{}'::jsonb, "effective_from" date NOT NULL, "effective_to" date, "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_leave_policies_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "CHK_0775328bd921ae51df900f129a" CHECK (annual_entitlement >= 0), CONSTRAINT "CHK_020dd78b8454e2a37e4ae62509" CHECK (effective_to IS NULL OR effective_to >= effective_from), CONSTRAINT "PK_7d3b46bd2974cbb56e3831f3f34" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "employee_leave_policies" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "policy_id" uuid NOT NULL, "effective_from" date NOT NULL, "effective_to" date, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_employee_leave_policies_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_6037fdb08a3f54575052e4b8357" UNIQUE ("tenant_id", "employee_id", "policy_id", "effective_from"), CONSTRAINT "CHK_5653b09063e475db8c7035e5a5" CHECK (effective_to IS NULL OR effective_to >= effective_from), CONSTRAINT "PK_3508f3fd39be34feca000ef289c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_balances" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "leave_type_id" uuid NOT NULL, "period_start" date NOT NULL, "period_end" date NOT NULL, "credited" numeric(18,2) NOT NULL DEFAULT '0', "used" numeric(18,2) NOT NULL DEFAULT '0', "pending" numeric(18,2) NOT NULL DEFAULT '0', "adjusted" numeric(18,2) NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_leave_balances_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_f862a1ff59865fc8f0c51be4a3f" UNIQUE ("tenant_id", "employee_id", "leave_type_id", "period_start"), CONSTRAINT "CHK_745c35e81a41b8ea2d990baf9e" CHECK (period_end >= period_start), CONSTRAINT "CHK_2f380a2a7d6a035510a19def55" CHECK (credited >= 0 AND used >= 0 AND pending >= 0), CONSTRAINT "CHK_90c24f4590533a4273ebae5732" CHECK (credited + adjusted - used - pending >= 0), CONSTRAINT "PK_a1d90dff48fb2bfd23a7163d077" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_requests" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "leave_type_id" uuid NOT NULL, "policy_id" uuid NOT NULL, "start_date" date NOT NULL, "end_date" date NOT NULL, "units" numeric(18,2) NOT NULL, "start_half" character varying(32) NOT NULL DEFAULT 'full', "end_half" character varying(32) NOT NULL DEFAULT 'full', "reason" text NOT NULL, "status" character varying(32) NOT NULL DEFAULT 'pending', "reviewer_id" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "review_comment" text, "cancelled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_leave_requests_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "CHK_ee441be2fe3a2a1efffc668216" CHECK (end_date >= start_date AND units > 0 AND mod(units, 0.5) = 0), CONSTRAINT "CHK_cf1a3f106a8b0f98375e602409" CHECK (status IN ('pending','approved','rejected','cancelled')), CONSTRAINT "CHK_11bdfd5e2042968692e1c71f82" CHECK (start_half IN ('full','am','pm') AND end_half IN ('full','am','pm')), CONSTRAINT "PK_d3abcf9a16cef1450129e06fa9f" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d58f73687e4c06bdcdf96dddde" ON "leave_requests" ("tenant_id", "employee_id", "start_date") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_25b3486c88c77032291ffd95f2" ON "leave_requests" ("tenant_id", "status") `,
    );
    await queryRunner.query(
      `CREATE TABLE "leave_balance_entries" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "balance_id" uuid NOT NULL, "request_id" uuid, "actor_id" uuid, "kind" character varying(32) NOT NULL DEFAULT 'credit', "units" numeric(18,2) NOT NULL, "reason" text NOT NULL, "idempotency_key" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_leave_balance_entries_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_14a46d86d5372cb541bbe33342d" UNIQUE ("tenant_id", "idempotency_key"), CONSTRAINT "CHK_82e58cded479c6cdbb08c18a5f" CHECK (kind IN ('credit','reserve','release','use','restore','adjust')), CONSTRAINT "CHK_e941ac88f2f08b1c272415115b" CHECK (units <> 0), CONSTRAINT "PK_7cb9471da11ab7bd7bb0db8db49" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "salary_components" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "code" text NOT NULL, "name" text NOT NULL, "kind" character varying(32) NOT NULL DEFAULT 'earning', "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_salary_components_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_f3a0e2ab8eb2ff4e999bc1a2215" UNIQUE ("tenant_id", "code"), CONSTRAINT "CHK_9395034486e3373797fbcde8e1" CHECK (kind IN ('earning','deduction')), CONSTRAINT "PK_07f83a0db55d0f294bfff38fb74" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "salary_structures" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "effective_from" date NOT NULL, "effective_to" date, "currency" character varying(3) NOT NULL, "created_by" uuid, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_salary_structures_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_a03a3365955eefeeb3e4a76bcd2" UNIQUE ("tenant_id", "employee_id", "effective_from"), CONSTRAINT "CHK_13cf6ea931c9c9ff6cc2d09500" CHECK (effective_to IS NULL OR effective_to >= effective_from), CONSTRAINT "PK_1800f745fd1ebe08981cd422acd" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "salary_structure_lines" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "salary_structure_id" uuid NOT NULL, "component_id" uuid NOT NULL, "amount" numeric(18,2) NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_salary_structure_lines_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_d2b07718d1104adc50ded0a7c06" UNIQUE ("tenant_id", "salary_structure_id", "component_id"), CONSTRAINT "CHK_9dd0bf11b3a86f929dcf6e9c57" CHECK (amount >= 0), CONSTRAINT "PK_0f77af5f0e3c203bc89774f01f2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payroll_runs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "period_start" date NOT NULL, "period_end" date NOT NULL, "pay_date" date, "status" character varying(32) NOT NULL DEFAULT 'draft', "currency" character varying(3) NOT NULL, "gross_total" numeric(18,2) NOT NULL DEFAULT '0', "deduction_total" numeric(18,2) NOT NULL DEFAULT '0', "net_total" numeric(18,2) NOT NULL DEFAULT '0', "calculation_config" jsonb NOT NULL DEFAULT '{}'::jsonb, "reviewed_by" uuid, "reviewed_at" TIMESTAMP WITH TIME ZONE, "locked_by" uuid, "locked_at" TIMESTAMP WITH TIME ZONE, "published_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_payroll_runs_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_f35fab12b717e6e6c0200988d0d" UNIQUE ("tenant_id", "period_start", "period_end"), CONSTRAINT "CHK_9fd975f4bd6c58da24ff21c189" CHECK (period_end >= period_start), CONSTRAINT "CHK_bf61927352cd8f279bf7d99013" CHECK (status IN ('draft','processing','calculated','reviewed','locked')), CONSTRAINT "CHK_ea74f746895fabc7fbc5438a10" CHECK (gross_total >= 0 AND deduction_total >= 0 AND net_total = gross_total - deduction_total), CONSTRAINT "CHK_de5c63f689a2f141df0daacc74" CHECK (status <> 'locked' OR (locked_at IS NOT NULL AND locked_by IS NOT NULL)), CONSTRAINT "CHK_b8cca634e6913d43de9299b3ad" CHECK (published_at IS NULL OR status = 'locked'), CONSTRAINT "PK_6049f42c972640c0eb99ba8035e" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payroll_employees" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "payroll_run_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "gross" numeric(18,2) NOT NULL DEFAULT '0', "deductions" numeric(18,2) NOT NULL DEFAULT '0', "net" numeric(18,2) NOT NULL DEFAULT '0', "input_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_payroll_employees_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_788f0ef88dc7c065ea3ad6047b1" UNIQUE ("tenant_id", "payroll_run_id", "employee_id"), CONSTRAINT "CHK_475cd676a5c3df7efddd502226" CHECK (gross >= 0 AND deductions >= 0 AND net = gross - deductions), CONSTRAINT "PK_8d55df27829c9b55c4c28b862f8" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "payroll_lines" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "payroll_employee_id" uuid NOT NULL, "component_id" uuid, "component_code" text NOT NULL, "component_name" text NOT NULL, "kind" character varying(32) NOT NULL DEFAULT 'earning', "amount" numeric(18,2) NOT NULL, "is_manual" boolean NOT NULL DEFAULT false, "adjustment_reason" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_payroll_lines_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "CHK_dd178e85d8180b84ebf492343c" CHECK (amount >= 0), CONSTRAINT "CHK_ac812be033199c7027da660fa7" CHECK (kind IN ('earning','deduction')), CONSTRAINT "CHK_22aa40110a93520fe127132fa0" CHECK (NOT is_manual OR (adjustment_reason IS NOT NULL AND length(trim(adjustment_reason)) > 0)), CONSTRAINT "PK_3108929e5baed091559aa5b039c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_218e5e52263ed9ffa8ffa5cb77" ON "payroll_lines" ("tenant_id", "payroll_employee_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "payslips" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "payroll_employee_id" uuid NOT NULL, "object_key" text, "status" character varying(32) NOT NULL DEFAULT 'pending', "published_at" TIMESTAMP WITH TIME ZONE, "generation_version" integer NOT NULL DEFAULT '1', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_payslips_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_44fce0b532a1257602639dc6734" UNIQUE ("tenant_id", "payroll_employee_id"), CONSTRAINT "CHK_899272c8af23cc7023acbf23fb" CHECK (status IN ('pending','generated','published','failed')), CONSTRAINT "CHK_a121e5678c32780457e2a9311c" CHECK (generation_version > 0), CONSTRAINT "CHK_f955b4a17822ab75533066ddbf" CHECK (status <> 'published' OR (published_at IS NOT NULL AND object_key IS NOT NULL)), CONSTRAINT "PK_2b1cd07059daf60cc440c9976e1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "document_categories" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "code" text NOT NULL, "name" text NOT NULL, "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_document_categories_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_b918d9f8325f0ab52f0f00f461c" UNIQUE ("tenant_id", "code"), CONSTRAINT "PK_672faab02d41a41ffd92ecd69e1" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "employee_id" uuid NOT NULL, "category_id" uuid NOT NULL, "title" text NOT NULL, "issue_date" date, "expiry_date" date, "visibility" character varying(32) NOT NULL DEFAULT 'hr_only', "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_documents_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "CHK_f84f8fcd1dbce7b533cdd99c09" CHECK (visibility IN ('hr_only','employee','team')), CONSTRAINT "CHK_29243da9c323bf141e0f639f5f" CHECK (expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_15171961110a696de603c07468" ON "documents" ("tenant_id", "employee_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b4e5f7c4b90b61f51ffc2ceba7" ON "documents" ("tenant_id", "expiry_date") `,
    );
    await queryRunner.query(
      `CREATE TABLE "document_versions" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "document_id" uuid NOT NULL, "version" integer NOT NULL DEFAULT '1', "object_key" text NOT NULL, "original_filename" text NOT NULL, "mime_type" text NOT NULL, "size_bytes" bigint NOT NULL, "checksum" text, "uploaded_by" uuid NOT NULL, "archived_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_document_versions_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_56957c25a3d131f945890e16eab" UNIQUE ("tenant_id", "document_id", "version"), CONSTRAINT "UQ_882af328444faf9b40596660fb8" UNIQUE ("tenant_id", "object_key"), CONSTRAINT "CHK_0bad36114670167ea9cc33c1f0" CHECK (version > 0 AND size_bytes > 0), CONSTRAINT "PK_baf26dab035c6d6fc433f9dc6a2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "recipient_id" uuid NOT NULL, "type" text NOT NULL, "title" text NOT NULL, "body" text, "resource_type" text, "resource_id" uuid, "read_at" TIMESTAMP WITH TIME ZONE, "event_key" text NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_notifications_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_87b69148b49d8ce55bdffcab5cd" UNIQUE ("tenant_id", "recipient_id", "event_key"), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ced250817163a6df5e2028f8a3" ON "notifications" ("tenant_id", "recipient_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox_events" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "event_type" text NOT NULL, "aggregate_id" uuid NOT NULL, "payload" jsonb NOT NULL DEFAULT '{}'::jsonb, "idempotency_key" text NOT NULL, "available_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "processed_at" TIMESTAMP WITH TIME ZONE, "attempts" integer NOT NULL DEFAULT '0', "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_outbox_events_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "UQ_99eba29ffa95e9aef3fd042b078" UNIQUE ("tenant_id", "idempotency_key"), CONSTRAINT "PK_6689a16c00d09b8089f6237f1d2" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_c9c423d69d3a49f9bc33ad7fe4" ON "outbox_events" ("tenant_id", "processed_at", "available_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "export_jobs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "requested_by" uuid NOT NULL, "report_type" text NOT NULL, "filters" jsonb NOT NULL DEFAULT '{}'::jsonb, "status" character varying(32) NOT NULL DEFAULT 'pending', "object_key" text, "expires_at" TIMESTAMP WITH TIME ZONE, "error_code" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_export_jobs_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "PK_3044ce6f1c6af24058ee609e063" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_846eeb9af594b26063dde28b5c" ON "export_jobs" ("tenant_id", "requested_by", "created_at") `,
    );
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "actor_id" uuid, "action" text NOT NULL, "entity_type" text NOT NULL, "entity_id" uuid, "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb, "request_id" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_audit_logs_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_898d14750b88319b89b1ab66cd" ON "audit_logs" ("tenant_id", "created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_995671e3d78249653ab941244f" ON "audit_logs" ("tenant_id", "entity_type", "entity_id") `,
    );
    await queryRunner.query(
      `CREATE TABLE "platform_admins" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "email" text NOT NULL, "password_hash" text NOT NULL, "disabled_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_7ddfa7abfaf477f671ccc566c83" UNIQUE ("email"), CONSTRAINT "PK_faecb3398d1962507b44c76e4f0" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TABLE "support_access_grants" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "tenant_id" uuid NOT NULL, "platform_admin_id" uuid NOT NULL, "approved_by" uuid NOT NULL, "reason" text NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "uq_support_access_grants_tenant_id" UNIQUE ("tenant_id", "id"), CONSTRAINT "PK_902bce1d8282d901bd323887872" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" ADD CONSTRAINT "FK_6768840c11b572526d5f3017ddf" FOREIGN KEY ("plan_code") REFERENCES "subscription_plans"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_109638590074998bb72a2f2cf08" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" ADD CONSTRAINT "FK_e59a01f4fe46ebbece575d9a0fc" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_156cd3e5710ec8c0a4bbe7865fb" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_f9bff865ac6c94a129aa9a30f55" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" ADD CONSTRAINT "FK_10f6c613b076a97c1e5b9c0b4be" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_d6fcb39857e2116aff96b97df0b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_93768b0601ce624ec538a92473c" FOREIGN KEY ("tenant_id", "role_id") REFERENCES "roles"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" ADD CONSTRAINT "FK_aae7df9d481dcdb2dafd1d938c1" FOREIGN KEY ("permission_code") REFERENCES "permissions"("code") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_tokens" ADD CONSTRAINT "FK_e58b49121a8f397a7298095ad18" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_tokens" ADD CONSTRAINT "FK_0203b8471999b99e95e08229eba" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_22aa22eb69a1e6826a1f58902d1" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_32a6ac85a3a94e9d0ff397ab917" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "departments" ADD CONSTRAINT "FK_146fd7019eea73f8ee7bbb52d4a" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "designations" ADD CONSTRAINT "FK_43d6a115dd09868d51494f7545d" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" ADD CONSTRAINT "FK_0d60360876129137646731c60c7" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_schedules" ADD CONSTRAINT "FK_3b20a2f889fe306684adcafa266" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_schedules" ADD CONSTRAINT "FK_b7e4e2c3cd17a0dd894b764818c" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "locations"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_588d18aeef0504067e40c682788" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_ba177570d81e3749b86ec2fb7c5" FOREIGN KEY ("tenant_id", "user_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_f94168a407b98d43c6d682bba82" FOREIGN KEY ("tenant_id", "department_id") REFERENCES "departments"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_488fdde7091546896b6a5d04866" FOREIGN KEY ("tenant_id", "designation_id") REFERENCES "designations"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_87b52eb89d6e25f8a643a9027d3" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "locations"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_558c936c28b259fa3cb8106ebdd" FOREIGN KEY ("tenant_id", "manager_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" ADD CONSTRAINT "FK_911fc29881febbc9a969ae5184a" FOREIGN KEY ("tenant_id", "work_schedule_id") REFERENCES "work_schedules"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_private_data" ADD CONSTRAINT "FK_a6c438d2f8370a64f155534d9bc" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_private_data" ADD CONSTRAINT "FK_4c0335f25af6870999850d2d112" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_c2f7fba0ddece3c4eabbaceb2e6" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" ADD CONSTRAINT "FK_15b2b131c2e90b3544381c5da07" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "FK_c8098a2e537b239608681999dcf" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "FK_b50968e4d89f06f8b2cddcc5dba" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "FK_b1a95252b61a06c17d1f52dab86" FOREIGN KEY ("tenant_id", "reviewer_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" ADD CONSTRAINT "FK_c54c400d1c627f5dc3bbb8c2b0a" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" ADD CONSTRAINT "FK_0b9fad80fa622f8b49beed02afc" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "locations"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_types" ADD CONSTRAINT "FK_eb555086a7c9271e5206b1889c6" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" ADD CONSTRAINT "FK_c46faa780f3360b0ad596a71ea7" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" ADD CONSTRAINT "FK_1758fed67a672c3bc6db613801a" FOREIGN KEY ("tenant_id", "leave_type_id") REFERENCES "leave_types"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_leave_policies" ADD CONSTRAINT "FK_9abff295eee39d2d51a3f986e63" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_leave_policies" ADD CONSTRAINT "FK_3d78e2c111d6e46bf96fd06c65f" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_leave_policies" ADD CONSTRAINT "FK_99ae926e57feda217d50ea12ca6" FOREIGN KEY ("tenant_id", "policy_id") REFERENCES "leave_policies"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD CONSTRAINT "FK_76bef7ed9ea69530e387826f438" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD CONSTRAINT "FK_b384b43c74a0e00cb419d353d53" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" ADD CONSTRAINT "FK_1d6144f7745b3cebc25d7d7f1a0" FOREIGN KEY ("tenant_id", "leave_type_id") REFERENCES "leave_types"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_4c0727a131644d680e44c3d2aa8" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_30f6e18ae9efa25b64faea7ca6d" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_3fde636223ee8821b3a45741335" FOREIGN KEY ("tenant_id", "leave_type_id") REFERENCES "leave_types"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_022bf6f0bcff5a712ff2a93b01a" FOREIGN KEY ("tenant_id", "policy_id") REFERENCES "leave_policies"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" ADD CONSTRAINT "FK_ef9388999e2334a7582591bf116" FOREIGN KEY ("tenant_id", "reviewer_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" ADD CONSTRAINT "FK_891c9d598e73102581bc868cc63" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" ADD CONSTRAINT "FK_85bb06842ab4ba7ca8027d27aa4" FOREIGN KEY ("tenant_id", "balance_id") REFERENCES "leave_balances"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" ADD CONSTRAINT "FK_00c0ebffe92ca4605ca559b4365" FOREIGN KEY ("tenant_id", "request_id") REFERENCES "leave_requests"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" ADD CONSTRAINT "FK_0509ea49d88b0ad03a466f6088d" FOREIGN KEY ("tenant_id", "actor_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_components" ADD CONSTRAINT "FK_2f2ea23bcd7a3500a7bb0f75e83" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structures" ADD CONSTRAINT "FK_fed7166a2462f813fc0ddc77f3d" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structures" ADD CONSTRAINT "FK_2d3f3e537dc8b0d432b913d333a" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structures" ADD CONSTRAINT "FK_93a71dc5eab09409985723086cf" FOREIGN KEY ("tenant_id", "created_by") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structure_lines" ADD CONSTRAINT "FK_e4c2ea14001067cd7312a5b2ff5" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structure_lines" ADD CONSTRAINT "FK_2a731fcbe17b9c941772c59263c" FOREIGN KEY ("tenant_id", "salary_structure_id") REFERENCES "salary_structures"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structure_lines" ADD CONSTRAINT "FK_8732297bea7a3ba03134d19609d" FOREIGN KEY ("tenant_id", "component_id") REFERENCES "salary_components"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" ADD CONSTRAINT "FK_90dca85e9c4fbf1363e67323863" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" ADD CONSTRAINT "FK_cb8bbabac0e4766f5bdc06457e0" FOREIGN KEY ("tenant_id", "reviewed_by") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" ADD CONSTRAINT "FK_e43a0b112a143c1050de48c0403" FOREIGN KEY ("tenant_id", "locked_by") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_employees" ADD CONSTRAINT "FK_592608f2e4086bb5d6b4201ca37" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_employees" ADD CONSTRAINT "FK_82478350aa41ec4b1839580be41" FOREIGN KEY ("tenant_id", "payroll_run_id") REFERENCES "payroll_runs"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_employees" ADD CONSTRAINT "FK_8c35762dd25a518845cacf4dc0b" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_lines" ADD CONSTRAINT "FK_e5d21661a8800854c5c6102cc9d" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_lines" ADD CONSTRAINT "FK_218e5e52263ed9ffa8ffa5cb775" FOREIGN KEY ("tenant_id", "payroll_employee_id") REFERENCES "payroll_employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_lines" ADD CONSTRAINT "FK_f8e446b17f5f6d93583cab859b0" FOREIGN KEY ("tenant_id", "component_id") REFERENCES "salary_components"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payslips" ADD CONSTRAINT "FK_40956e26bd6c726a7109991745b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payslips" ADD CONSTRAINT "FK_44fce0b532a1257602639dc6734" FOREIGN KEY ("tenant_id", "payroll_employee_id") REFERENCES "payroll_employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_categories" ADD CONSTRAINT "FK_4871220b04ac2f46d7db74e5edc" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_5109a94ccfd3f39bf4a7a1e1fa6" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_15171961110a696de603c074689" FOREIGN KEY ("tenant_id", "employee_id") REFERENCES "employees"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" ADD CONSTRAINT "FK_2bf8416f14d00aef67e941877f3" FOREIGN KEY ("tenant_id", "category_id") REFERENCES "document_categories"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" ADD CONSTRAINT "FK_f7dd57ce45ece40350a0d13997c" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" ADD CONSTRAINT "FK_a27b14b7801ddc0095c671eb7e8" FOREIGN KEY ("tenant_id", "document_id") REFERENCES "documents"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" ADD CONSTRAINT "FK_567e9af9af904a3e5a5c22db4d0" FOREIGN KEY ("tenant_id", "uploaded_by") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_d93ddd7e1b890535ecafbb334ec" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" ADD CONSTRAINT "FK_d7ef1affcfac4b177713533ba8f" FOREIGN KEY ("tenant_id", "recipient_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_events" ADD CONSTRAINT "FK_d02ad1ef31dd2bf74be842f8a7b" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "export_jobs" ADD CONSTRAINT "FK_12376c181edbdcc0bfa1f432e27" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "export_jobs" ADD CONSTRAINT "FK_db5c3045d54365c5a789d1c46a9" FOREIGN KEY ("tenant_id", "requested_by") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_6f18d459490bb48923b1f40bdb7" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" ADD CONSTRAINT "FK_bdfd8bca705616490ff36dbf7a8" FOREIGN KEY ("tenant_id", "actor_id") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_access_grants" ADD CONSTRAINT "FK_9aa8c8a1e8314cec9d2f0e1be9f" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_access_grants" ADD CONSTRAINT "FK_fa0267d94fe26ff8f9f19fbe2be" FOREIGN KEY ("tenant_id", "approved_by") REFERENCES "users"("tenant_id","id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_access_grants" ADD CONSTRAINT "FK_7d2b44f3258c4b8932c6f5a8aa5" FOREIGN KEY ("platform_admin_id") REFERENCES "platform_admins"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "support_access_grants" DROP CONSTRAINT "FK_7d2b44f3258c4b8932c6f5a8aa5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_access_grants" DROP CONSTRAINT "FK_fa0267d94fe26ff8f9f19fbe2be"`,
    );
    await queryRunner.query(
      `ALTER TABLE "support_access_grants" DROP CONSTRAINT "FK_9aa8c8a1e8314cec9d2f0e1be9f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_bdfd8bca705616490ff36dbf7a8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "audit_logs" DROP CONSTRAINT "FK_6f18d459490bb48923b1f40bdb7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "export_jobs" DROP CONSTRAINT "FK_db5c3045d54365c5a789d1c46a9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "export_jobs" DROP CONSTRAINT "FK_12376c181edbdcc0bfa1f432e27"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_events" DROP CONSTRAINT "FK_d02ad1ef31dd2bf74be842f8a7b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_d7ef1affcfac4b177713533ba8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "notifications" DROP CONSTRAINT "FK_d93ddd7e1b890535ecafbb334ec"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" DROP CONSTRAINT "FK_567e9af9af904a3e5a5c22db4d0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" DROP CONSTRAINT "FK_a27b14b7801ddc0095c671eb7e8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_versions" DROP CONSTRAINT "FK_f7dd57ce45ece40350a0d13997c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_2bf8416f14d00aef67e941877f3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_15171961110a696de603c074689"`,
    );
    await queryRunner.query(
      `ALTER TABLE "documents" DROP CONSTRAINT "FK_5109a94ccfd3f39bf4a7a1e1fa6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "document_categories" DROP CONSTRAINT "FK_4871220b04ac2f46d7db74e5edc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payslips" DROP CONSTRAINT "FK_44fce0b532a1257602639dc6734"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payslips" DROP CONSTRAINT "FK_40956e26bd6c726a7109991745b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_lines" DROP CONSTRAINT "FK_f8e446b17f5f6d93583cab859b0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_lines" DROP CONSTRAINT "FK_218e5e52263ed9ffa8ffa5cb775"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_lines" DROP CONSTRAINT "FK_e5d21661a8800854c5c6102cc9d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_employees" DROP CONSTRAINT "FK_8c35762dd25a518845cacf4dc0b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_employees" DROP CONSTRAINT "FK_82478350aa41ec4b1839580be41"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_employees" DROP CONSTRAINT "FK_592608f2e4086bb5d6b4201ca37"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" DROP CONSTRAINT "FK_e43a0b112a143c1050de48c0403"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" DROP CONSTRAINT "FK_cb8bbabac0e4766f5bdc06457e0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payroll_runs" DROP CONSTRAINT "FK_90dca85e9c4fbf1363e67323863"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structure_lines" DROP CONSTRAINT "FK_8732297bea7a3ba03134d19609d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structure_lines" DROP CONSTRAINT "FK_2a731fcbe17b9c941772c59263c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structure_lines" DROP CONSTRAINT "FK_e4c2ea14001067cd7312a5b2ff5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structures" DROP CONSTRAINT "FK_93a71dc5eab09409985723086cf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structures" DROP CONSTRAINT "FK_2d3f3e537dc8b0d432b913d333a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_structures" DROP CONSTRAINT "FK_fed7166a2462f813fc0ddc77f3d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "salary_components" DROP CONSTRAINT "FK_2f2ea23bcd7a3500a7bb0f75e83"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" DROP CONSTRAINT "FK_0509ea49d88b0ad03a466f6088d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" DROP CONSTRAINT "FK_00c0ebffe92ca4605ca559b4365"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" DROP CONSTRAINT "FK_85bb06842ab4ba7ca8027d27aa4"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balance_entries" DROP CONSTRAINT "FK_891c9d598e73102581bc868cc63"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_ef9388999e2334a7582591bf116"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_022bf6f0bcff5a712ff2a93b01a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_3fde636223ee8821b3a45741335"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_30f6e18ae9efa25b64faea7ca6d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_requests" DROP CONSTRAINT "FK_4c0727a131644d680e44c3d2aa8"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP CONSTRAINT "FK_1d6144f7745b3cebc25d7d7f1a0"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP CONSTRAINT "FK_b384b43c74a0e00cb419d353d53"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_balances" DROP CONSTRAINT "FK_76bef7ed9ea69530e387826f438"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_leave_policies" DROP CONSTRAINT "FK_99ae926e57feda217d50ea12ca6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_leave_policies" DROP CONSTRAINT "FK_3d78e2c111d6e46bf96fd06c65f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_leave_policies" DROP CONSTRAINT "FK_9abff295eee39d2d51a3f986e63"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" DROP CONSTRAINT "FK_1758fed67a672c3bc6db613801a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_policies" DROP CONSTRAINT "FK_c46faa780f3360b0ad596a71ea7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "leave_types" DROP CONSTRAINT "FK_eb555086a7c9271e5206b1889c6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" DROP CONSTRAINT "FK_0b9fad80fa622f8b49beed02afc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "holidays" DROP CONSTRAINT "FK_c54c400d1c627f5dc3bbb8c2b0a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_regularizations" DROP CONSTRAINT "FK_b1a95252b61a06c17d1f52dab86"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_regularizations" DROP CONSTRAINT "FK_b50968e4d89f06f8b2cddcc5dba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance_regularizations" DROP CONSTRAINT "FK_c8098a2e537b239608681999dcf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_15b2b131c2e90b3544381c5da07"`,
    );
    await queryRunner.query(
      `ALTER TABLE "attendance" DROP CONSTRAINT "FK_c2f7fba0ddece3c4eabbaceb2e6"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_private_data" DROP CONSTRAINT "FK_4c0335f25af6870999850d2d112"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employee_private_data" DROP CONSTRAINT "FK_a6c438d2f8370a64f155534d9bc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_911fc29881febbc9a969ae5184a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_558c936c28b259fa3cb8106ebdd"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_87b52eb89d6e25f8a643a9027d3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_488fdde7091546896b6a5d04866"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_f94168a407b98d43c6d682bba82"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_ba177570d81e3749b86ec2fb7c5"`,
    );
    await queryRunner.query(
      `ALTER TABLE "employees" DROP CONSTRAINT "FK_588d18aeef0504067e40c682788"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_schedules" DROP CONSTRAINT "FK_b7e4e2c3cd17a0dd894b764818c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "work_schedules" DROP CONSTRAINT "FK_3b20a2f889fe306684adcafa266"`,
    );
    await queryRunner.query(
      `ALTER TABLE "locations" DROP CONSTRAINT "FK_0d60360876129137646731c60c7"`,
    );
    await queryRunner.query(
      `ALTER TABLE "designations" DROP CONSTRAINT "FK_43d6a115dd09868d51494f7545d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "departments" DROP CONSTRAINT "FK_146fd7019eea73f8ee7bbb52d4a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_32a6ac85a3a94e9d0ff397ab917"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sessions" DROP CONSTRAINT "FK_22aa22eb69a1e6826a1f58902d1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_tokens" DROP CONSTRAINT "FK_0203b8471999b99e95e08229eba"`,
    );
    await queryRunner.query(
      `ALTER TABLE "auth_tokens" DROP CONSTRAINT "FK_e58b49121a8f397a7298095ad18"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_aae7df9d481dcdb2dafd1d938c1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_93768b0601ce624ec538a92473c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permissions" DROP CONSTRAINT "FK_d6fcb39857e2116aff96b97df0b"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_10f6c613b076a97c1e5b9c0b4be"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_f9bff865ac6c94a129aa9a30f55"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_roles" DROP CONSTRAINT "FK_156cd3e5710ec8c0a4bbe7865fb"`,
    );
    await queryRunner.query(
      `ALTER TABLE "roles" DROP CONSTRAINT "FK_e59a01f4fe46ebbece575d9a0fc"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_109638590074998bb72a2f2cf08"`,
    );
    await queryRunner.query(
      `ALTER TABLE "tenants" DROP CONSTRAINT "FK_6768840c11b572526d5f3017ddf"`,
    );
    await queryRunner.query(`DROP TABLE "support_access_grants"`);
    await queryRunner.query(`DROP TABLE "platform_admins"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_995671e3d78249653ab941244f"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_898d14750b88319b89b1ab66cd"`,
    );
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_846eeb9af594b26063dde28b5c"`,
    );
    await queryRunner.query(`DROP TABLE "export_jobs"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_c9c423d69d3a49f9bc33ad7fe4"`,
    );
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ced250817163a6df5e2028f8a3"`,
    );
    await queryRunner.query(`DROP TABLE "notifications"`);
    await queryRunner.query(`DROP TABLE "document_versions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b4e5f7c4b90b61f51ffc2ceba7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_15171961110a696de603c07468"`,
    );
    await queryRunner.query(`DROP TABLE "documents"`);
    await queryRunner.query(`DROP TABLE "document_categories"`);
    await queryRunner.query(`DROP TABLE "payslips"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_218e5e52263ed9ffa8ffa5cb77"`,
    );
    await queryRunner.query(`DROP TABLE "payroll_lines"`);
    await queryRunner.query(`DROP TABLE "payroll_employees"`);
    await queryRunner.query(`DROP TABLE "payroll_runs"`);
    await queryRunner.query(`DROP TABLE "salary_structure_lines"`);
    await queryRunner.query(`DROP TABLE "salary_structures"`);
    await queryRunner.query(`DROP TABLE "salary_components"`);
    await queryRunner.query(`DROP TABLE "leave_balance_entries"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_25b3486c88c77032291ffd95f2"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d58f73687e4c06bdcdf96dddde"`,
    );
    await queryRunner.query(`DROP TABLE "leave_requests"`);
    await queryRunner.query(`DROP TABLE "leave_balances"`);
    await queryRunner.query(`DROP TABLE "employee_leave_policies"`);
    await queryRunner.query(`DROP TABLE "leave_policies"`);
    await queryRunner.query(`DROP TABLE "leave_types"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fd0ca2316a42556ce05a3bfbd5"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a959396af79cc4e53a7905e4ac"`,
    );
    await queryRunner.query(`DROP TABLE "holidays"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_76344da1629dc6e2658514b6ac"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_cdf62c60d4d18d6612644192dd"`,
    );
    await queryRunner.query(`DROP TABLE "attendance_regularizations"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ede922b422cdf4535511597c0c"`,
    );
    await queryRunner.query(`DROP TABLE "attendance"`);
    await queryRunner.query(`DROP TABLE "employee_private_data"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_87b52eb89d6e25f8a643a9027d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f94168a407b98d43c6d682bba8"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_558c936c28b259fa3cb8106ebd"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a8ac83ca3562eb5bdd1b69bc10"`,
    );
    await queryRunner.query(`DROP TABLE "employees"`);
    await queryRunner.query(`DROP TABLE "work_schedules"`);
    await queryRunner.query(`DROP TABLE "locations"`);
    await queryRunner.query(`DROP TABLE "designations"`);
    await queryRunner.query(`DROP TABLE "departments"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_32a6ac85a3a94e9d0ff397ab91"`,
    );
    await queryRunner.query(`DROP TABLE "sessions"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e9b85314da14c6592fbabcab0b"`,
    );
    await queryRunner.query(`DROP TABLE "auth_tokens"`);
    await queryRunner.query(`DROP TABLE "role_permissions"`);
    await queryRunner.query(`DROP TABLE "user_roles"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TABLE "tenants"`);
    await queryRunner.query(`DROP TABLE "subscription_plans"`);
  }
}

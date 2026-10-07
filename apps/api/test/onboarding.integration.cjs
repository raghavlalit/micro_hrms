/* End-to-end onboarding verification in a disposable local PostgreSQL database. */
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { DataSource } = require('typeorm');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { databaseOptions } = require('../dist/database/database.options');
const {
  hashPassword,
  credentialHash,
} = require('../dist/modules/auth/password');

async function main() {
  const migrationOptions = databaseOptions(true);
  const runtimeOptions = databaseOptions();
  const url = new URL(migrationOptions.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Tests require local PostgreSQL');
  const database = `microhrms_onboarding_test_${randomBytes(8).toString('hex')}`;
  const admin = new DataSource(migrationOptions);
  let db,
    app,
    created = false,
    checks = 0;
  function pass(name) {
    checks++;
    console.log(`PASS ${name}`);
  }
  try {
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${database}"`);
    created = true;
    url.pathname = `/${database}`;
    db = new DataSource({ ...migrationOptions, url: url.toString() });
    await db.initialize();
    await db.runMigrations();
    const runtimeUrl = new URL(runtimeOptions.url);
    runtimeUrl.pathname = `/${database}`;
    process.env.DATABASE_URL = runtimeUrl.toString();
    process.env.AUTH_ORIGINS = 'http://localhost:4200';
    const password = 'Company onboarding test password 123!';
    await db.query(
      'INSERT INTO platform_admins (email,password_hash,must_change_password) VALUES ($1,$2,false)',
      ['platform@example.test', await hashPassword(password)],
    );
    const { AppModule } = require('../dist/app.module');
    app = await NestFactory.create(AppModule, {
      logger: false,
      abortOnError: false,
    });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    async function request(path, method = 'GET', body, cookie, headers = {}) {
      const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-HRMS-Request': '1',
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const platform = await request('/auth/login', 'POST', {
      kind: 'platform',
      email: 'platform@example.test',
      password,
    });
    assert.equal(platform.status, 200);
    const company = (slug) => ({
      name: `Company ${slug}`,
      slug,
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      date_format: 'dd/MM/yyyy',
      contact_email: 'contact@example.test',
      contact_phone: '',
      address: { city: 'Pune', country: 'India' },
      admin_email: 'admin@example.test',
      admin_name: 'Company Administrator',
    });
    const create = (dto) =>
      request('/platform/companies', 'POST', dto, platform.cookie);
    const activate = (token) =>
      request('/auth/activate', 'POST', { token, password });
    const login = (slug) =>
      request('/auth/login', 'POST', {
        kind: 'tenant',
        company: slug,
        email: 'admin@example.test',
        password,
      });
    assert.equal((await request('/platform/companies')).status, 401);
    assert.equal(
      (
        await request(
          '/platform/companies',
          'POST',
          company('csrf'),
          platform.cookie,
          { 'X-HRMS-Request': '' },
        )
      ).status,
      403,
    );
    pass(
      'company endpoints require platform authentication and CSRF protection',
    );
    for (const invalid of [
      { timezone: 'Wrong/Timezone' },
      { currency: 'ZZZ' },
      { slug: 'INVALID SLUG' },
      { name: ' ' },
      { admin_email: 'bad' },
      { status: 'active' },
      { tenant_id: 'spoofed' },
      { employee_limit: 999999 },
    ]) {
      assert.equal(
        (await create({ ...company('invalid'), ...invalid })).status,
        400,
      );
    }
    pass('company inputs reject invalid values and protected fields');
    const a = await create(company('company-a'));
    assert.equal(a.status, 201, JSON.stringify(a.body));
    const b = await create(company('company-b'));
    assert.equal(b.status, 201);
    const aId = a.body.company.id,
      bId = b.body.company.id;
    assert.notEqual(aId, bId);
    pass('platform creates independent company workspaces');
    const counts = {
      roles: 4,
      users: 1,
      user_roles: 1,
      departments: 10,
      designations: 12,
      locations: 1,
      work_schedules: 1,
      leave_types: 4,
      salary_components: 7,
      document_categories: 8,
      leave_policies: 0,
      holidays: 0,
      employees: 0,
    };
    for (const [table, count] of Object.entries(counts)) {
      const [row] = await db.query(
        `SELECT count(*)::int AS count FROM ${table} WHERE tenant_id=$1`,
        [aId],
      );
      assert.equal(row.count, count, table);
    }
    const [roleCount] = await db.query(
      'SELECT count(*)::int AS count FROM role_permissions WHERE tenant_id=$1',
      [aId],
    );
    assert.equal(roleCount.count, 50);
    const [invited] = await db.query(
      'SELECT id,status,password_hash FROM users WHERE tenant_id=$1',
      [aId],
    );
    assert.equal(invited.status, 'invited');
    assert.equal(invited.password_hash, null);
    const [stored] = await db.query(
      'SELECT token_hash FROM auth_tokens WHERE tenant_id=$1',
      [aId],
    );
    assert.equal(stored.token_hash, credentialHash(a.body.invitation.token));
    pass(
      'complete tenant defaults and invited admin are seeded; only activation hash is stored',
    );
    assert.equal((await login('company-a')).status, 401);
    pass('invited administrator cannot sign in before activation');
    const duplicate = await create(company('company-a'));
    assert.equal(duplicate.status, 409);
    const raced = await Promise.all([
      create(company('concurrent')),
      create(company('concurrent')),
    ]);
    assert.deepEqual(
      raced.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    const [unique] = await db.query(
      "SELECT count(*)::int AS count FROM tenants WHERE slug='concurrent'",
    );
    assert.equal(unique.count, 1);
    pass(
      'duplicate and concurrent company creation cannot duplicate tenant or master records',
    );

    const {
      TenantDefaultsService,
    } = require('../dist/modules/tenants/tenant-defaults.service');
    const defaults = app.get(TenantDefaultsService),
      original = defaults.create.bind(defaults);
    defaults.create = async function (...args) {
      await original.apply(this, args);
      throw new Error('Simulated failure after defaults');
    };
    const failure = await create(company('rollback'));
    defaults.create = original;
    assert.equal(failure.status, 500);
    assert.equal(
      (await db.query("SELECT id FROM tenants WHERE slug='rollback'")).length,
      0,
    );
    pass('a failure after seeding rolls back company and every dependent row');

    const listed = await request(
      '/platform/companies?search=company-&page=1&limit=1',
      'GET',
      undefined,
      platform.cookie,
    );
    assert.equal(listed.status, 200);
    assert.equal(listed.body.total, 2);
    assert.equal(listed.body.items.length, 1);
    assert.equal(listed.body.items[0].settings, undefined);
    assert.equal(listed.body.items[0].invitation, undefined);
    pass(
      'platform directory is paginated and does not expose invitation secrets',
    );

    assert.equal(
      (await activate(a.body.invitation.token.replace(aId, bId))).status,
      401,
    );
    const reissued = await request(
      `/platform/companies/${aId}/admin-invitation`,
      'POST',
      {},
      platform.cookie,
    );
    assert.equal(reissued.status, 201);
    assert.equal((await activate(a.body.invitation.token)).status, 401);
    assert.equal((await activate(reissued.body.invitation.token)).status, 200);
    assert.equal((await activate(reissued.body.invitation.token)).status, 401);
    assert.equal(
      (
        await request(
          `/platform/companies/${aId}/admin-invitation`,
          'POST',
          {},
          platform.cookie,
        )
      ).status,
      409,
    );
    pass(
      'activation is tenant-bound, one-time, and replacement invalidates earlier links',
    );
    const races = await Promise.all([
      activate(b.body.invitation.token),
      activate(b.body.invitation.token),
    ]);
    assert.deepEqual(
      races.map((r) => r.status).sort((a, b) => a - b),
      [200, 401],
    );
    pass('concurrent activation only succeeds once');
    const sa = await login('company-a'),
      sb = await login('company-b');
    assert.equal(sa.status, 200);
    assert.equal(sb.status, 200);
    assert.ok(sa.body.user.permissions.includes('company.manage'));
    pass(
      'activated administrators receive company-admin permissions and independent sessions',
    );
    assert.equal(
      (
        await request(
          '/platform/companies',
          'POST',
          company('forbidden'),
          sa.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (await request('/platform/companies', 'GET', undefined, sa.cookie))
        .status,
      403,
    );
    assert.equal(
      (await request('/company/settings', 'GET', undefined, platform.cookie))
        .status,
      403,
    );
    pass(
      'company administrators cannot use platform APIs and platform admins cannot use company APIs',
    );

    const profileA = await request(
      '/company/settings',
      'GET',
      undefined,
      sa.cookie,
      { 'X-Tenant-ID': bId },
    );
    assert.equal(profileA.body.id, aId);
    assert.equal(profileA.body.settings, undefined);
    const {
      slug: _slug,
      admin_email: _adminEmail,
      admin_name: _adminName,
      ...profile
    } = company('company-a');
    assert.equal(
      (
        await request(
          '/company/settings',
          'PUT',
          { ...profile, name: 'Custom Company A' },
          sa.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          '/company/settings',
          'PUT',
          { ...profile, settings: { onboarding: { admin_user_id: 'evil' } } },
          sa.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request('/company/settings', 'GET', undefined, sb.cookie)).body
        .name,
      'Company company-b',
    );
    pass(
      'company profile updates use the authenticated tenant and protect system metadata',
    );

    const departmentsA = await request(
      '/organization/departments',
      'GET',
      undefined,
      sa.cookie,
    );
    const departmentsB = await request(
      '/organization/departments',
      'GET',
      undefined,
      sb.cookie,
    );
    assert.equal(departmentsA.body.length, 10);
    const departmentA = departmentsA.body[0],
      departmentB = departmentsB.body[0];
    assert.equal(
      (
        await request(
          `/organization/departments/${departmentB.id}`,
          'PUT',
          { name: 'Forbidden', code: 'BAD' },
          sa.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/organization/departments/${departmentA.id}`,
          'PUT',
          { name: 'Custom Administration', code: departmentA.code },
          sa.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/organization/departments', 'GET', undefined, sb.cookie))
        .body[0].name,
      departmentB.name,
    );
    assert.equal(
      (
        await request(
          '/organization/departments',
          'POST',
          { name: 'Bad', code: 'BAD', tenant_id: bId },
          sa.cookie,
        )
      ).status,
      400,
    );
    pass('master updates cannot target another tenant or override tenant_id');
    for (const endpoint of [
      'organization/designations',
      'organization/locations',
      'organization/work-schedules',
      'leave/types',
      'leave/policies',
      'payroll/components',
      'documents/categories',
      'holidays',
    ]) {
      assert.equal(
        (await request(`/${endpoint}`, 'GET', undefined, sa.cookie)).status,
        200,
        endpoint,
      );
    }
    pass('company settings expose all seeded master categories');
    const locB = (
      await request('/organization/locations', 'GET', undefined, sb.cookie)
    ).body[0].id;
    const schedule = {
      name: 'Saturday schedule',
      location_id: locB,
      working_days: [1, 2, 3, 4, 5, 6],
      start_time: '09:00',
      end_time: '18:00',
      late_grace_minutes: 5,
      half_day_minutes: 240,
      full_day_minutes: 480,
    };
    assert.equal(
      (
        await request(
          '/organization/work-schedules',
          'POST',
          schedule,
          sa.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/organization/work-schedules',
          'POST',
          { ...schedule, location_id: null },
          sa.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await request(
          '/organization/work-schedules',
          'POST',
          {
            ...schedule,
            location_id: null,
            name: 'Invalid schedule',
            full_day_minutes: 60,
          },
          sa.cookie,
        )
      ).status,
      400,
    );
    pass(
      'work schedule validation and composite foreign keys enforce company boundaries',
    );
    const type = (await request('/leave/types', 'GET', undefined, sa.cookie))
      .body[0];
    const policy = {
      name: 'Company policy',
      leave_type_id: type.id,
      annual_entitlement: 12,
      is_paid: true,
      balance_controlled: true,
      carry_forward_enabled: false,
      exclude_non_working_days: true,
      effective_from: '2026-01-01',
      effective_to: null,
    };
    assert.equal(
      (await request('/leave/policies', 'POST', policy, sa.cookie)).status,
      201,
    );
    assert.equal(
      (
        await request(
          '/holidays',
          'POST',
          {
            name: 'Company holiday',
            holiday_date: '2026-12-25',
            location_id: null,
          },
          sa.cookie,
        )
      ).status,
      201,
    );
    assert.equal(
      (await request('/leave/policies', 'GET', undefined, sb.cookie)).body
        .length,
      0,
    );
    assert.equal(
      (await request('/holidays', 'GET', undefined, sb.cookie)).body.length,
      0,
    );
    pass('leave policies and holidays remain independent per company');

    await db.query(
      "DELETE FROM role_permissions WHERE tenant_id=$1 AND permission_code='company.manage'",
      [bId],
    );
    assert.equal(
      (await request('/organization/departments', 'GET', undefined, sb.cookie))
        .status,
      403,
    );
    pass('settings permissions are checked live rather than trusting the UI');
    const expired = await create(company('expired'));
    await db.query(
      "UPDATE auth_tokens SET expires_at=now()-interval '1 second' WHERE tenant_id=$1",
      [expired.body.company.id],
    );
    assert.equal((await activate(expired.body.invitation.token)).status, 401);
    pass('expired activation links cannot set a password');
    const suspended = await create(company('suspended'));
    await db.query("UPDATE tenants SET status='suspended' WHERE id=$1", [
      suspended.body.company.id,
    ]);
    assert.equal((await activate(suspended.body.invitation.token)).status, 401);
    pass('suspended company cannot activate an administrator');

    const runtime = app.get(DataSource);
    await assert.rejects(
      () =>
        runtime.query(
          "INSERT INTO tenants(name,slug) VALUES ('Unauthenticated','unauthenticated')",
        ),
      (error) => error.driverError?.code === '42501',
    );
    assert.equal((await runtime.query('SELECT * FROM tenants')).length, 0);
    assert.equal((await runtime.query('SELECT * FROM users')).length, 0);
    pass(
      'database rejects unscoped provisioning and transaction scope does not leak',
    );
    const {
      PlatformDatabaseService,
    } = require('../dist/modules/platform/platform-database.service');
    const platformToken = platform.cookie.slice(
      platform.cookie.indexOf('=') + 1,
    );
    await app
      .get(PlatformDatabaseService)
      .withSession(platformToken, async (manager) =>
        assert.equal((await manager.query('SELECT * FROM users')).length, 0),
      );
    pass('platform catalog scope does not grant access to tenant user tables');
    const [audits] = await db.query(
      'SELECT count(*)::int AS count FROM audit_logs WHERE tenant_id=$1',
      [aId],
    );
    assert.ok(audits.count >= 6);
    assert.equal(
      (await db.query('SELECT count(*)::int AS count FROM tenants')).at(0)
        .count,
      5,
    );
    pass(
      'onboarding and settings changes create audit entries without orphan companies',
    );
    console.log(`Onboarding integration checks passed: ${checks}`);
  } finally {
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (admin.isInitialized) await admin.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

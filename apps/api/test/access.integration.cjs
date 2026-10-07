/* Real API + PostgreSQL checks. Only creates/drops a random disposable local database. */
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { DataSource } = require('typeorm');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { databaseOptions } = require('../dist/database/database.options');
const { hashPassword } = require('../dist/modules/auth/password');

async function main() {
  const migrationOptions = databaseOptions(true),
    runtimeOptions = databaseOptions();
  const url = new URL(migrationOptions.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Tests require local PostgreSQL');
  const database = `microhrms_access_test_${randomBytes(8).toString('hex')}`;
  const admin = new DataSource(migrationOptions);
  let db,
    app,
    created = false,
    checks = 0;
  const pass = (name) => {
    checks++;
    console.log(`PASS ${name}`);
  };
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
    const key = randomBytes(32).toString('base64');
    process.env.EMPLOYEE_DATA_KEYS = JSON.stringify({ v1: key });
    process.env.EMPLOYEE_DATA_KEY_VERSION = 'v1';
    const password = 'Employee integration password 123!';
    await db.query(
      'INSERT INTO platform_admins(email,password_hash,must_change_password) VALUES ($1,$2,false)',
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
    async function request(path, method = 'GET', body, cookie) {
      const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-HRMS-Request': '1',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const login = (company, email = 'admin@example.test') =>
      request('/auth/login', 'POST', {
        kind: 'tenant',
        company,
        email,
        password,
      });
    const activate = (token) =>
      request('/auth/activate', 'POST', { token, password });
    const platform = await request('/auth/login', 'POST', {
      kind: 'platform',
      email: 'platform@example.test',
      password,
    });
    async function company(slug) {
      const result = await request(
        '/platform/companies',
        'POST',
        {
          name: slug,
          slug,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          date_format: 'dd/MM/yyyy',
          contact_email: 'contact@example.test',
          address: {},
          admin_name: 'Admin',
          admin_email: 'admin@example.test',
        },
        platform.cookie,
      );
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal((await activate(result.body.invitation.token)).status, 200);
      return { id: result.body.company.id, cookie: (await login(slug)).cookie };
    }
    const a = await company('access-a'),
      b = await company('access-b');
    const req = (path, method = 'GET', body) =>
      request(path, method, body, a.cookie);
    const reason = 'Access review integration test';
    const catalog = (await req('/roles')).body;
    const role = (code) => catalog.roles.find((r) => r.code === code).id;
    const adminId = (await req('/auth/me')).body.user.id;
    const foreignCatalog = (await request('/roles', 'GET', undefined, b.cookie))
      .body;
    const invite = (email, roles = [role('employee')]) =>
      req('/users', 'POST', {
        display_name: 'Test User',
        email,
        role_ids: roles,
        reason,
      });
    const updateRoles = (id, ids, cookie = a.cookie) =>
      request(`/users/${id}/roles`, 'PUT', { role_ids: ids, reason }, cookie);
    const setStatus = (id, status, cookie = a.cookie) =>
      request(`/users/${id}/status`, 'PUT', { status, reason }, cookie);
    const expectStatus = (result, expected) =>
      assert.equal(result.status, expected, JSON.stringify(result.body));
    for (const path of ['/users', '/roles']) {
      expectStatus(await request(path), 401);
      expectStatus(await request(path, 'GET', undefined, platform.cookie), 403);
    }
    expectStatus(await req('/users?page=0'), 400);
    expectStatus(await req('/users?limit=101'), 400);
    expectStatus(
      await req('/users', 'POST', {
        display_name: 'Test',
        email: 'bad',
        role_ids: [],
        reason,
      }),
      400,
    );
    expectStatus(
      await req('/users', 'POST', {
        display_name: 'Test',
        email: 'test@example.test',
        role_ids: [role('employee')],
        reason,
        tenant_id: b.id,
      }),
      400,
    );
    pass(
      'access endpoints require tenant permissions and reject invalid or injected fields',
    );

    const invited = await invite(' Person@Example.Test ');
    expectStatus(invited, 201);
    const personId = invited.body.id;
    expectStatus(await invite('person@example.test'), 409);
    const second = await req(`/users/${personId}/invitation`, 'POST', {
      reason,
    });
    expectStatus(second, 201);
    expectStatus(await activate(invited.body.invitation.token), 401);
    expectStatus(await activate(second.body.invitation.token), 200);
    expectStatus(await activate(second.body.invitation.token), 401);
    let personCookie = (await login('access-a', 'person@example.test')).cookie;
    expectStatus(await request('/users', 'GET', undefined, personCookie), 403);
    expectStatus(await request('/roles', 'GET', undefined, personCookie), 403);
    expectStatus(
      await request(
        '/roles',
        'POST',
        {
          code: 'bad',
          name: 'Bad',
          permission_codes: ['roles.manage'],
          reason,
        },
        personCookie,
      ),
      403,
    );
    pass(
      'normalized invitations are single-use and employee accounts cannot manage access',
    );

    const list = await req('/users?search=person&status=active&limit=1');
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items.length, 1);
    assert.equal(list.body.items[0].email, 'person@example.test');
    for (const field of ['password_hash', 'tenant_id', 'token'])
      assert.equal(list.body.items[0][field], undefined);
    assert.equal(
      (await req(`/users?role_id=${role('employee')}`)).body.total,
      1,
    );
    assert.equal((await req('/users?search=%25')).body.total, 0);
    pass('directory filters and pagination expose safe account fields only');

    const foreignAdmin = (await request('/auth/me', 'GET', undefined, b.cookie))
      .body.user.id;
    expectStatus(await updateRoles(foreignAdmin, [role('employee')]), 404);
    expectStatus(await setStatus(foreignAdmin, 'disabled'), 404);
    expectStatus(
      await req(`/users/${foreignAdmin}/invitation`, 'POST', { reason }),
      404,
    );
    expectStatus(
      await updateRoles(personId, [foreignCatalog.roles[0].id]),
      404,
    );
    expectStatus(
      await req(`/roles/${foreignCatalog.roles[0].id}`, 'PUT', {
        name: 'Stolen',
        permission_codes: ['roles.manage'],
        reason,
      }),
      404,
    );
    pass('known foreign user and role IDs cannot cross tenant boundaries');

    const hr = await invite('hr@example.test', [role('hr')]);
    expectStatus(hr, 201);
    expectStatus(await activate(hr.body.invitation.token), 200);
    const hrCookie = (await login('access-a', 'hr@example.test')).cookie;
    expectStatus(await setStatus(adminId, 'disabled'), 409);
    expectStatus(await updateRoles(adminId, [role('employee')]), 409);
    expectStatus(await setStatus(adminId, 'disabled', hrCookie), 409);
    expectStatus(await updateRoles(adminId, [role('hr')], hrCookie), 409);
    expectStatus(
      await req(`/roles/${role('company_admin')}`, 'PUT', {
        name: 'Unsafe',
        permission_codes: ['employees.read.self'],
        reason,
      }),
      409,
    );
    pass(
      'self-lockout, last active administrator removal and built-in role edits are blocked',
    );

    const createRole = (code, codes, cookie = a.cookie) =>
      request(
        '/roles',
        'POST',
        { code, name: 'Custom ' + code, permission_codes: codes, reason },
        cookie,
      );
    expectStatus(await createRole('platform_admin', ['platform.manage']), 400);
    const delegated = await createRole('access_helper', [
      'roles.manage',
      'employees.read.self',
    ]);
    expectStatus(delegated, 201);
    const customId = delegated.body.id;
    expectStatus(await createRole('access_helper', ['roles.manage']), 409);
    const limited = await invite('limited@example.test', [customId]);
    expectStatus(limited, 201);
    expectStatus(await activate(limited.body.invitation.token), 200);
    const limitedCookie = (await login('access-a', 'limited@example.test'))
      .cookie;
    expectStatus(await request('/users', 'GET', undefined, limitedCookie), 200);
    expectStatus(
      await updateRoles(personId, [role('company_admin')], limitedCookie),
      403,
    );
    expectStatus(await setStatus(adminId, 'disabled', limitedCookie), 403);
    expectStatus(
      await createRole('escalation', ['payroll.manage'], limitedCookie),
      403,
    );
    expectStatus(
      await request(
        `/roles/${customId}`,
        'PUT',
        { name: 'Own role', permission_codes: ['roles.manage'], reason },
        limitedCookie,
      ),
      409,
    );
    pass(
      'custom roles work while delegated administrators cannot escalate or edit their own role',
    );

    expectStatus(await updateRoles(personId, [customId]), 200);
    expectStatus(
      await request('/auth/me', 'GET', undefined, personCookie),
      401,
    );
    personCookie = (await login('access-a', 'person@example.test')).cookie;
    expectStatus(await request('/users', 'GET', undefined, personCookie), 200);
    expectStatus(
      await req(`/roles/${customId}`, 'PUT', {
        name: 'Profile only',
        permission_codes: ['employees.read.self'],
        reason,
      }),
      200,
    );
    expectStatus(
      await request('/auth/me', 'GET', undefined, personCookie),
      401,
    );
    expectStatus(
      await request('/auth/me', 'GET', undefined, limitedCookie),
      401,
    );
    personCookie = (await login('access-a', 'person@example.test')).cookie;
    expectStatus(await request('/users', 'GET', undefined, personCookie), 403);
    pass(
      'role assignment and permission edits revoke affected sessions and take effect on next login',
    );

    expectStatus(await setStatus(personId, 'disabled'), 200);
    expectStatus(
      await request('/auth/me', 'GET', undefined, personCookie),
      401,
    );
    expectStatus(await login('access-a', 'person@example.test'), 401);
    expectStatus(await setStatus(personId, 'enabled'), 200);
    expectStatus(await login('access-a', 'person@example.test'), 200);
    const pending = await invite('pending@example.test');
    expectStatus(pending, 201);
    expectStatus(await setStatus(pending.body.id, 'disabled'), 200);
    expectStatus(await setStatus(pending.body.id, 'enabled'), 200);
    expectStatus(await activate(pending.body.invitation.token), 401);
    const fresh = await req(`/users/${pending.body.id}/invitation`, 'POST', {
      reason,
    });
    expectStatus(await activate(fresh.body.invitation.token), 200);
    pass(
      'disable revokes access and tokens; restore requires fresh activation for unactivated users',
    );

    const employee = await req('/employees', 'POST', {
      employee_code: 'ACCESS001',
      first_name: 'Linked',
      last_name: 'Admin',
      joining_date: '2026-01-01',
      employment_type: 'Full-time',
      email: 'linked@example.test',
      address: {},
      emergency_contact: {},
    });
    expectStatus(employee, 201);
    expectStatus(await invite('linked@example.test'), 409);
    const employeeInvite = await req(
      `/employees/${employee.body.id}/invitation`,
      'POST',
      { role: 'employee' },
    );
    expectStatus(employeeInvite, 201);
    expectStatus(await activate(employeeInvite.body.invitation.token), 200);
    const linkedId = (await req('/users?search=linked@example.test')).body
      .items[0].id;
    expectStatus(await updateRoles(linkedId, [role('company_admin')]), 200);
    expectStatus(await updateRoles(adminId, [role('hr')], hrCookie), 200);
    a.cookie = (await login('access-a')).cookie;
    expectStatus(
      await req(`/employees/${employee.body.id}/status`, 'POST', {
        status: 'terminated',
        termination_date: '2026-01-02',
        reason,
      }),
      409,
    );
    expectStatus(
      await updateRoles(adminId, [role('company_admin')], hrCookie),
      200,
    );
    a.cookie = (await login('access-a')).cookie;
    expectStatus(
      await req(`/employees/${employee.body.id}/status`, 'POST', {
        status: 'terminated',
        termination_date: '2026-01-02',
        reason,
      }),
      201,
    );
    expectStatus(await setStatus(linkedId, 'enabled'), 409);
    pass(
      'employee linkage is preserved and lifecycle changes cannot remove the last admin or bypass termination',
    );

    const admin2 = await invite('admin2@example.test', [role('company_admin')]);
    expectStatus(admin2, 201);
    expectStatus(await activate(admin2.body.invitation.token), 200);
    const concurrent = await Promise.all([
      updateRoles(adminId, [role('hr')], hrCookie),
      updateRoles(admin2.body.id, [role('hr')], hrCookie),
    ]);
    assert.deepEqual(
      concurrent.map((r) => r.status).sort((a, b) => a - b),
      [200, 409],
    );
    a.cookie = (await login('access-a')).cookie;
    pass('concurrent demotions retain at least one active Company Admin');

    const [{ count }] = await db.query(
      "SELECT count(*)::int AS count FROM users WHERE tenant_id=$1 AND status IN ('active','invited')",
      [a.id],
    );
    await db.query('UPDATE tenants SET user_limit=$2 WHERE id=$1', [
      a.id,
      count + 1,
    ]);
    const capacity = await Promise.all([
      invite('capacity1@example.test'),
      invite('capacity2@example.test'),
    ]);
    assert.deepEqual(
      capacity.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    pass('concurrent invitations respect the company user limit');
    const audits = await db.query(
      "SELECT action,metadata FROM audit_logs WHERE tenant_id=$1 AND entity_type IN ('user','role')",
      [a.id],
    );
    for (const action of [
      'role.created',
      'role.updated',
      'user.invited',
      'user.invitation_reissued',
      'user.roles_changed',
      'user.status_changed',
    ])
      assert(audits.some((row) => row.action === action));
    assert(!JSON.stringify(audits).includes(second.body.invitation.token));
    assert(!JSON.stringify(audits).includes(password));
    pass(
      'access changes retain audit reasons without passwords or invitation tokens',
    );
    console.log(`Access integration checks passed: ${checks}`);
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

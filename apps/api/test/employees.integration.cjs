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
  const database = `microhrms_employee_test_${randomBytes(8).toString('hex')}`;
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
    const a = await company('employee-a'),
      b = await company('employee-b');
    const req = (path, method = 'GET', body) =>
      request(path, method, body, a.cookie);
    const profile = (code, extra = {}) => ({
      employee_code: code,
      first_name: 'Alex',
      last_name: code,
      date_of_birth: '1990-05-10',
      email: `${code.toLowerCase()}@example.test`,
      phone: '123456789',
      address: { city: 'Pune' },
      emergency_contact: { name: 'Emergency person', phone: '987654321' },
      joining_date: '2026-01-01',
      employment_type: 'Full-time',
      department_id: null,
      designation_id: null,
      location_id: null,
      manager_id: null,
      work_schedule_id: null,
      probation_ends_on: null,
      ...extra,
    });
    const create = async (code, extra = {}) => {
      const result = await req('/employees', 'POST', profile(code, extra));
      assert.equal(result.status, 201, JSON.stringify(result.body));
      return result.body;
    };
    const status = (id, state, extra = {}) =>
      req(`/employees/${id}/status`, 'POST', {
        status: state,
        reason: 'Integration test change',
        ...extra,
      });
    assert.equal((await request('/employees')).status, 401);
    assert.equal(
      (await request('/employees', 'GET', undefined, platform.cookie)).status,
      403,
    );
    pass('employee endpoints reject anonymous and platform accounts');
    const lookups = await req('/employees/lookups');
    assert.equal(lookups.status, 200);
    assert.equal(lookups.body.departments.length, 10);
    const foreignLookups = await request(
      '/employees/lookups',
      'GET',
      undefined,
      b.cookie,
    );
    assert.equal(
      (
        await req(
          '/employees',
          'POST',
          profile('FOREIGN', {
            department_id: foreignLookups.body.departments[0].id,
          }),
        )
      ).status,
      400,
    );
    pass('lookups are tenant-scoped and reject foreign assignments');
    for (const extra of [
      { tenant_id: b.id },
      { status: 'active' },
      { user_id: b.id },
      { address: { bank_account: 'secret' } },
      { first_name: ' ' },
      { joining_date: '2026-02-30' },
      { date_of_birth: '2026-02-01' },
      { probation_ends_on: '2025-01-01' },
    ]) {
      assert.equal(
        (await req('/employees', 'POST', profile('INVALID', extra))).status,
        400,
        JSON.stringify(extra),
      );
    }
    pass(
      'strict DTOs reject protected fields, arbitrary personal JSON and invalid dates',
    );
    const boss = await create('BOSS', {
      department_id: lookups.body.departments[0].id,
    });
    assert.equal(boss.status, 'invited');
    assert.equal((await status(boss.id, 'active')).status, 201);
    const report = await create('REPORT', {
      manager_id: boss.id,
      department_id: lookups.body.departments[0].id,
    });
    const peer = await create('PEER');
    assert.equal((await status(report.id, 'active')).status, 201);
    assert.equal(
      (await req('/employees', 'POST', profile('BOSS'))).status,
      409,
    );
    assert.equal(
      (
        await req(
          '/employees',
          'POST',
          profile('DUP_EMAIL', { email: 'BOSS@EXAMPLE.TEST' }),
        )
      ).status,
      409,
    );
    pass(
      'employee creation, lifecycle activation and case-insensitive email uniqueness',
    );
    const list = await req(
      `/employees?search=REPORT&department_id=${lookups.body.departments[0].id}&page=1&limit=1`,
    );
    assert.equal(list.body.total, 1);
    assert.equal(list.body.items[0].id, report.id);
    assert.equal(list.body.items[0].phone, undefined);
    assert.equal(list.body.items[0].joining_date, '2026-01-01');
    assert.equal((await req('/employees?search=%25')).body.total, 0);
    pass('search, filters and pagination return safe directory projections');
    assert.equal(
      (
        await req(
          `/employees/${boss.id}`,
          'PUT',
          profile('BOSS', { manager_id: report.id }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await req(
          `/employees/${boss.id}`,
          'PUT',
          profile('BOSS', { manager_id: boss.id }),
        )
      ).status,
      400,
    );
    assert.equal((await status(boss.id, 'inactive')).status, 409);
    await db.query('UPDATE departments SET archived_at=now() WHERE id=$1', [
      lookups.body.departments[1].id,
    ]);
    assert.equal(
      (
        await req(
          `/employees/${peer.id}`,
          'PUT',
          profile('PEER', { department_id: lookups.body.departments[1].id }),
        )
      ).status,
      400,
    );
    pass(
      'manager cycles, unavailable assignments and disabling a manager with reports are blocked',
    );
    assert.equal(
      (await request(`/employees/${boss.id}`, 'GET', undefined, b.cookie))
        .status,
      404,
    );
    assert.equal(
      (await request(`/employees/${boss.id}`, 'PUT', profile('BOSS'), b.cookie))
        .status,
      404,
    );
    assert.equal(
      (
        await request(
          `/employees/${boss.id}/private`,
          'GET',
          undefined,
          b.cookie,
        )
      ).status,
      404,
    );
    pass('known employee IDs cannot cross company boundaries');
    const privateBody = {
      bank_details: [{ label: 'Account number', value: 'sensitive-bank-9876' }],
      statutory_identifiers: [
        { label: 'Tax identifier', value: 'private-tax-1234' },
      ],
    };
    assert.equal(
      (await req(`/employees/${report.id}/private`, 'PUT', privateBody)).status,
      200,
    );
    assert.deepEqual(
      (await req(`/employees/${report.id}/private`)).body,
      privateBody,
    );
    const [stored] = await db.query(
      'SELECT * FROM employee_private_data WHERE employee_id=$1',
      [report.id],
    );
    assert(!JSON.stringify(stored).includes('sensitive-bank'));
    assert(!JSON.stringify(stored).includes('private-tax'));
    process.env.EMPLOYEE_DATA_KEYS = '{}';
    assert.equal(
      (await req(`/employees/${report.id}/private`, 'PUT', privateBody)).status,
      503,
    );
    process.env.EMPLOYEE_DATA_KEYS = JSON.stringify({
      v1: key,
      v2: randomBytes(32).toString('base64'),
    });
    process.env.EMPLOYEE_DATA_KEY_VERSION = 'v2';
    assert.deepEqual(
      (await req(`/employees/${report.id}/private`)).body,
      privateBody,
    );
    assert.equal(
      (await req(`/employees/${report.id}/private`, 'PUT', privateBody)).status,
      200,
    );
    const [rotated] = await db.query(
      'SELECT encryption_key_version FROM employee_private_data WHERE employee_id=$1',
      [report.id],
    );
    assert.equal(rotated.encryption_key_version, 'v2');
    pass(
      'private values are encrypted, read correctly, fail closed without keys and support key versions',
    );
    async function inviteEmployee(employee, role) {
      const result = await req(`/employees/${employee.id}/invitation`, 'POST', {
        role,
      });
      assert.equal(result.status, 201, JSON.stringify(result.body));
      return result.body.invitation.token;
    }
    const oldToken = await inviteEmployee(boss, 'manager');
    const bossToken = await inviteEmployee(boss, 'employee');
    assert.equal((await activate(oldToken)).status, 401);
    assert.equal((await activate(bossToken)).status, 200);
    assert.equal((await activate(bossToken)).status, 401);
    const bossLogin = await login('employee-a', 'boss@example.test');
    assert.equal(bossLogin.status, 200);
    const bossList = await request(
      '/employees',
      'GET',
      undefined,
      bossLogin.cookie,
    );
    assert.equal(bossList.body.total, 2);
    assert(bossList.body.items.some((row) => row.id === report.id));
    const bossReport = await request(
      `/employees/${report.id}`,
      'GET',
      undefined,
      bossLogin.cookie,
    );
    assert.equal(bossReport.body.access, 'team');
    assert.equal(bossReport.body.employee.date_of_birth, undefined);
    assert.equal(bossReport.body.employee.emergency_contact, undefined);
    assert.equal(
      (
        await request(
          `/employees/${peer.id}`,
          'GET',
          undefined,
          bossLogin.cookie,
        )
      ).status,
      404,
    );
    assert.equal(
      (
        await request(
          `/employees/${report.id}/private`,
          'GET',
          undefined,
          bossLogin.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/employees',
          'POST',
          profile('UNAUTHORIZED'),
          bossLogin.cookie,
        )
      ).status,
      403,
    );
    pass(
      'single-use invitations preserve roles on reissue; managers see only self/direct reports and no team personal data',
    );
    assert.equal(
      (await activate(await inviteEmployee(report, 'employee'))).status,
      200,
    );
    const employeeLogin = await login('employee-a', 'report@example.test');
    assert.equal(employeeLogin.status, 200);
    const self = await request(
      '/employees/me',
      'GET',
      undefined,
      employeeLogin.cookie,
    );
    assert.equal(self.body.employee.id, report.id);
    assert.equal(
      (await request('/employees', 'GET', undefined, employeeLogin.cookie)).body
        .total,
      1,
    );
    const selfContact = {
      phone: 'new phone',
      address: { city: 'Mumbai' },
      emergency_contact: { name: 'New contact' },
    };
    assert.equal(
      (
        await request(
          '/employees/me/contact',
          'PUT',
          selfContact,
          employeeLogin.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          '/employees/me/contact',
          'PUT',
          { ...selfContact, manager_id: peer.id },
          employeeLogin.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          `/employees/${report.id}`,
          'PUT',
          profile('REPORT'),
          employeeLogin.cookie,
        )
      ).status,
      403,
    );
    assert.deepEqual(
      (
        await request(
          `/employees/${report.id}/private`,
          'GET',
          undefined,
          employeeLogin.cookie,
        )
      ).body,
      privateBody,
    );
    assert.equal(
      (
        await request(
          `/employees/${report.id}/private`,
          'PUT',
          privateBody,
          employeeLogin.cookie,
        )
      ).status,
      403,
    );
    pass(
      'employees can view self and edit contact fields only; HR fields and private writes stay protected',
    );
    assert.equal(
      (
        await req(
          `/employees/${report.id}`,
          'PUT',
          profile('REPORT', {
            manager_id: boss.id,
            email: 'changed@example.test',
          }),
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await status(report.id, 'terminated', {
          termination_date: '2026-02-01',
        })
      ).status,
      201,
    );
    assert.equal(
      (await request('/auth/me', 'GET', undefined, employeeLogin.cookie))
        .status,
      401,
    );
    assert.equal(
      (await login('employee-a', 'report@example.test')).status,
      401,
    );
    assert.equal(
      (await req(`/employees/${report.id}`)).body.employee.status,
      'terminated',
    );
    assert.deepEqual(
      (await req(`/employees/${report.id}/private`)).body,
      privateBody,
    );
    assert.equal(
      (
        await db.query(
          'SELECT count(*)::int AS count FROM employees WHERE id=$1',
          [report.id],
        )
      )[0].count,
      1,
    );
    pass(
      'termination immediately disables login/sessions and retains employee and protected history',
    );
    await db.query('UPDATE tenants SET employee_limit=3 WHERE id=$1', [a.id]);
    const concurrent = await Promise.all([
      req('/employees', 'POST', profile('LIMIT_A')),
      req('/employees', 'POST', profile('LIMIT_B')),
    ]);
    assert.deepEqual(
      concurrent
        .map((result) => result.status)
        .sort((left, right) => left - right),
      [201, 409],
    );
    pass(
      'concurrent creation respects the employee limit including invitation reservations',
    );
    const [counter] = await db.query(
      'SELECT active_employee_count FROM tenants WHERE id=$1',
      [a.id],
    );
    assert.equal(counter.active_employee_count, 1);
    const audits = await db.query(
      'SELECT action,metadata FROM audit_logs WHERE tenant_id=$1 AND entity_type=$2',
      [a.id, 'employee'],
    );
    assert(audits.some((row) => row.action === 'employee.status_changed'));
    assert(audits.some((row) => row.action === 'employee.private_viewed'));
    assert(!JSON.stringify(audits).includes('sensitive-bank'));
    assert(!JSON.stringify(audits).includes('private-tax'));
    assert(!JSON.stringify(audits).includes(bossToken));
    pass(
      'headcount remains consistent and audits exclude private values and invitation tokens',
    );
    console.log(`Employee integration checks passed: ${checks}`);
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

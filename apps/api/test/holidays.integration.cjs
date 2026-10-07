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
  const database = `microhrms_holiday_test_${randomBytes(8).toString('hex')}`;
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
    const a = await company('holiday-a'),
      b = await company('holiday-b');
    const req = (path, method = 'GET', body) =>
      request(path, method, body, a.cookie);
    const expectStatus = (result, code) =>
      assert.equal(result.status, code, JSON.stringify(result.body));
    const holiday = (date, location_id = null, name = 'Sample holiday') => ({
      name,
      holiday_date: date,
      location_id,
      description: 'Test holiday',
    });
    const create = (body) => req('/holidays', 'POST', body);
    expectStatus(await request('/holidays/calendar'), 401);
    expectStatus(
      await request('/holidays/calendar', 'GET', undefined, platform.cookie),
      403,
    );
    const first = await req('/holidays/calendar');
    expectStatus(first, 200);
    assert.equal(first.body.can_manage, true);
    assert.equal(first.body.scope, 'all');
    assert.deepEqual(first.body.items, []);
    assert.equal(first.body.timezone, 'Asia/Kolkata');
    for (const query of [
      'year=0',
      'year=2026.5',
      'year=2201',
      'scope=invalid',
      'tenant_id=' + b.id,
      'scope=location',
      'scope=company&location_id=' + a.id,
    ])
      expectStatus(await req('/holidays/calendar?' + query), 400);
    for (const body of [
      holiday('2026-02-30'),
      holiday('2201-01-01'),
      holiday('2026-01-01', null, '   '),
      { ...holiday('2026-01-01'), tenant_id: b.id },
    ])
      expectStatus(await create(body), 400);
    pass(
      'holiday routes authenticate tenants and validate calendar filters and strict business dates',
    );

    const locations = (await req('/organization/locations')).body;
    const hq = locations[0].id;
    const branch = await req('/organization/locations', 'POST', {
      name: 'Branch',
      code: 'BRANCH',
      address: {},
    });
    expectStatus(branch, 201);
    const branchId = branch.body.id;
    const foreignLocation = (
      await request('/organization/locations', 'GET', undefined, b.cookie)
    ).body[0].id;
    expectStatus(await create(holiday('2026-01-01', foreignLocation)), 400);
    expectStatus(
      await req(
        '/holidays/calendar?scope=location&location_id=' + foreignLocation,
      ),
      404,
    );
    const companyHoliday = await create(
      holiday('2026-12-25', null, '  Company Day  '),
    );
    expectStatus(companyHoliday, 201);
    assert.equal(companyHoliday.body.name, 'Company Day');
    assert.equal(companyHoliday.body.holiday_date, '2026-12-25');
    expectStatus(await create(holiday('2026-12-25')), 409);
    expectStatus(await create(holiday('2026-12-25', hq)), 409);
    const hqHoliday = await create(holiday('2026-10-20', hq, 'HQ Day'));
    expectStatus(hqHoliday, 201);
    expectStatus(await create(holiday('2026-10-20', hq)), 409);
    expectStatus(
      await create(holiday('2026-10-20', branchId, 'Branch Day')),
      201,
    );
    expectStatus(await create(holiday('2026-10-20')), 409);
    pass(
      'same-scope and company/location overlaps are rejected while different locations may share a date',
    );

    expectStatus(await create(holiday('2025-12-31', null, 'Prior year')), 201);
    const all = (await req('/holidays/calendar?year=2026')).body;
    assert.equal(all.items.length, 3);
    assert.equal(all.summary.dates, 2);
    assert.deepEqual(
      all.items.map((h) => h.holiday_date),
      ['2026-10-20', '2026-10-20', '2026-12-25'],
    );
    const byLocation = (
      await req('/holidays/calendar?year=2026&scope=location&location_id=' + hq)
    ).body;
    assert.deepEqual(
      byLocation.items.map((h) => h.name),
      ['HQ Day', 'Company Day'],
    );
    assert.equal(
      (await req('/holidays/calendar?year=2026&scope=company')).body.items
        .length,
      1,
    );
    assert.equal((await req('/holidays')).body.length, 4);
    expectStatus(
      await request(
        `/holidays/${hqHoliday.body.id}`,
        'PUT',
        holiday('2026-10-21', hq),
        b.cookie,
      ),
      404,
    );
    assert.equal(
      (
        await request(
          '/holidays/calendar?year=2026',
          'GET',
          undefined,
          b.cookie,
        )
      ).body.items.length,
      0,
    );
    pass(
      'annual and location calendars are ordered, date-only, scoped and compatible with the admin list',
    );

    const employee = await req('/employees', 'POST', {
      employee_code: 'HOL001',
      first_name: 'Holiday',
      last_name: 'Employee',
      joining_date: '2026-01-01',
      employment_type: 'Full-time',
      email: 'holidays@example.test',
      location_id: hq,
      address: {},
      emergency_contact: {},
    });
    expectStatus(employee, 201);
    const invite = await req(
      `/employees/${employee.body.id}/invitation`,
      'POST',
      { role: 'manager' },
    );
    expectStatus(invite, 201);
    expectStatus(await activate(invite.body.invitation.token), 200);
    const cookie = (await login('holiday-a', 'holidays@example.test')).cookie;
    const mine = (
      await request('/holidays/calendar?year=2026', 'GET', undefined, cookie)
    ).body;
    assert.equal(mine.scope, 'mine');
    assert.equal(mine.location_id, hq);
    assert.equal(mine.can_manage, false);
    assert.deepEqual(mine.locations, []);
    assert.deepEqual(
      mine.items.map((h) => h.name),
      ['HQ Day', 'Company Day'],
    );
    for (const query of [
      'scope=all',
      'scope=company',
      'scope=location&location_id=' + branchId,
      'scope=mine&location_id=' + hq,
    ])
      expectStatus(
        await request(
          '/holidays/calendar?year=2026&' + query,
          'GET',
          undefined,
          cookie,
        ),
        403,
      );
    expectStatus(await request('/holidays', 'GET', undefined, cookie), 403);
    expectStatus(
      await request('/holidays', 'POST', holiday('2026-08-01'), cookie),
      403,
    );
    expectStatus(
      await request(
        `/holidays/${hqHoliday.body.id}`,
        'PUT',
        holiday('2026-08-01'),
        cookie,
      ),
      403,
    );
    const unlinked = (await req('/holidays/calendar?year=2026&scope=mine'))
      .body;
    assert.equal(unlinked.linked_employee, false);
    assert.deepEqual(
      unlinked.items.map((h) => h.name),
      ['Company Day'],
    );
    await db.query('UPDATE employees SET location_id=NULL WHERE id=$1', [
      employee.body.id,
    ]);
    const noLocation = (
      await request('/holidays/calendar?year=2026', 'GET', undefined, cookie)
    ).body;
    assert.equal(noLocation.linked_employee, true);
    assert.deepEqual(
      noLocation.items.map((h) => h.name),
      ['Company Day'],
    );
    await db.query('UPDATE employees SET location_id=$2 WHERE id=$1', [
      employee.body.id,
      hq,
    ]);
    pass(
      'employees and managers cannot broaden location scope or write; unlinked/unassigned accounts see company-wide dates only',
    );

    expectStatus(
      await req(
        `/holidays/${hqHoliday.body.id}`,
        'PUT',
        holiday('2026-12-25', hq),
      ),
      409,
    );
    expectStatus(
      await req(
        `/holidays/${hqHoliday.body.id}`,
        'PUT',
        holiday('2026-10-20', hq, 'HQ Day Updated'),
      ),
      200,
    );
    await db.query('UPDATE locations SET archived_at=now() WHERE id=$1', [hq]);
    expectStatus(await create(holiday('2026-11-01', hq)), 400);
    expectStatus(
      await req(
        `/holidays/${companyHoliday.body.id}`,
        'PUT',
        holiday('2026-12-25', hq),
      ),
      400,
    );
    expectStatus(
      await req(
        `/holidays/${hqHoliday.body.id}`,
        'PUT',
        holiday('2026-10-20', hq, 'Archived HQ holiday'),
      ),
      200,
    );
    assert(
      (
        await request('/holidays/calendar?year=2026', 'GET', undefined, cookie)
      ).body.items.some((h) => h.name === 'Archived HQ holiday'),
    );
    pass(
      'edits validate conflicts; archived location assignments stay visible but cannot be newly assigned',
    );

    const concurrent = await Promise.all([
      create(holiday('2026-11-15')),
      create(holiday('2026-11-15', branchId)),
    ]);
    assert.deepEqual(
      concurrent.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    pass(
      'concurrent company-wide and location writes cannot create overlapping holiday dates',
    );

    const {
      companyToday,
    } = require('../dist/modules/holidays/holiday-calendar');
    assert.equal(
      companyToday('Asia/Kolkata', new Date('2026-12-31T20:00:00Z')),
      '2027-01-01',
    );
    assert.equal(
      companyToday('America/Los_Angeles', new Date('2026-01-01T02:00:00Z')),
      '2025-12-31',
    );
    assert.equal(
      companyToday('America/New_York', new Date('2026-03-08T07:30:00Z')),
      '2026-03-08',
    );
    const {
      HolidayService,
    } = require('../dist/modules/holidays/holiday.service');
    const {
      TenantDatabaseService,
    } = require('../dist/modules/tenants/tenant-database.service');
    // Legacy overlapping entries can predate the stricter service rule; consumers deduplicate.
    await db.query(
      'INSERT INTO holidays(tenant_id,holiday_date,name,location_id) VALUES($1,$2,$3,$4)',
      [a.id, '2026-12-25', 'Legacy HQ overlap', hq],
    );
    const dates = await app
      .get(TenantDatabaseService)
      .withTenant(a.id, (manager) =>
        app
          .get(HolidayService)
          .applicableDates(manager, a.id, hq, '2026-12-25', '2026-12-25'),
      );
    assert.deepEqual([...dates], ['2026-12-25']);
    const noForeign = await app
      .get(TenantDatabaseService)
      .withTenant(b.id, (manager) =>
        app
          .get(HolidayService)
          .applicableDates(
            manager,
            b.id,
            foreignLocation,
            '2026-01-01',
            '2026-12-31',
          ),
      );
    assert.equal(noForeign.size, 0);
    const refreshed = (
      await request('/holidays/calendar?year=2026', 'GET', undefined, cookie)
    ).body;
    assert(
      refreshed.items.filter((h) => h.holiday_date === '2026-12-25').length ===
        2,
    );
    assert.equal(
      refreshed.summary.dates,
      new Set(refreshed.items.map((h) => h.holiday_date)).size,
    );
    pass(
      'company timezone boundaries and inclusive deduplicated dates are ready for attendance/leave consumers',
    );
    const audits = await db.query(
      "SELECT action,metadata FROM audit_logs WHERE tenant_id=$1 AND entity_type='holiday'",
      [a.id],
    );
    assert(
      audits.some(
        (a) =>
          a.action === 'holiday.created' &&
          a.metadata.after.name === 'Company Day',
      ),
    );
    assert(
      audits.some(
        (a) =>
          a.action === 'holiday.updated' &&
          a.metadata.before.name === 'HQ Day' &&
          a.metadata.after.name === 'HQ Day Updated',
      ),
    );
    pass('holiday writes retain safe before/after audit history');
    console.log(`Holiday integration checks passed: ${checks}`);
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

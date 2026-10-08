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
  const database = `microhrms_leave_test_${randomBytes(8).toString('hex')}`;
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
    const a = await company('attendance-a'),
      b = await company('attendance-b');
    const req = (path, method = 'GET', body) =>
      request(path, method, body, a.cookie);
    const expectStatus = (result, status) =>
      assert.equal(result.status, status, JSON.stringify(result.body));
    const {
      AttendanceClock,
    } = require('../dist/modules/attendance/attendance.service');
    let now = new Date('2026-10-07T03:30:00Z');
    app.get(AttendanceClock).now = () => new Date(now);
    const lookups = (await req('/employees/lookups')).body,
      schedule = lookups.work_schedules[0].id,
      location = lookups.locations[0].id;
    async function employee(code, manager_id = null, role = 'employee') {
      const result = await req('/employees', 'POST', {
        employee_code: code,
        first_name: 'Attendance',
        last_name: code,
        email: code.toLowerCase() + '@example.test',
        joining_date: '2026-01-01',
        employment_type: 'Full-time',
        location_id: location,
        work_schedule_id: schedule,
        manager_id,
        address: {},
        emergency_contact: {},
      });
      expectStatus(result, 201);
      const invitation = await req(
        `/employees/${result.body.id}/invitation`,
        'POST',
        { role },
      );
      expectStatus(invitation, 201);
      expectStatus(await activate(invitation.body.invitation.token), 200);
      return {
        id: result.body.id,
        cookie: (
          await login('attendance-a', code.toLowerCase() + '@example.test')
        ).cookie,
      };
    }
    const boss = await employee('BOSS', null, 'manager'),
      staff = await employee('STAFF', boss.id),
      other = await employee('OTHER');
    const self = (path, method = 'GET', body) =>
      request('/leave' + path, method, body, staff.cookie);
    const team = (path, method = 'GET', body) =>
      request('/leave' + path, method, body, boss.cookie);
    const types = (await req('/leave/types')).body;
    const type = types.find((t) => t.code === 'CL') ?? types[0];
    const policyBody = {
      leave_type_id: type.id,
      name: 'Annual leave',
      annual_entitlement: 12,
      is_paid: true,
      balance_controlled: true,
      carry_forward_enabled: true,
      exclude_non_working_days: true,
      effective_from: '2026-01-01',
      effective_to: null,
    };
    const policyResponse = await req('/leave/policies', 'POST', policyBody);
    expectStatus(policyResponse, 201);
    const policy = policyResponse.body.id;
    const setup = (employeeId = staff.id, year = 2026, extra = {}) =>
      req(`/leave/employees/${employeeId}/entitlements`, 'POST', {
        policy_id: policy,
        year,
        reason: 'Reviewed annual entitlement',
        ...extra,
      });
    const application = (start, end = start, extra = {}) => ({
      policy_id: policy,
      start_date: start,
      end_date: end,
      start_half: 'full',
      end_half: 'full',
      reason: 'Planned personal leave',
      ...extra,
    });
    const submit = (start, end = start, extra = {}) =>
      self('/requests', 'POST', application(start, end, extra));
    const review = (id, decision = 'approved', cookie = boss.cookie) =>
      request(
        `/leave/requests/${id}/review`,
        'POST',
        { decision, comment: 'Reviewed request' },
        cookie,
      );
    const cancel = (id, cookie = staff.cookie) =>
      request(
        `/leave/requests/${id}/cancel`,
        'POST',
        { reason: 'Plans changed' },
        cookie,
      );
    const balance = async () => (await self('/me?year=2026')).body.balances[0];

    expectStatus(await request('/leave/me'), 401);
    expectStatus(
      await request('/leave/people', 'GET', undefined, platform.cookie),
      403,
    );
    expectStatus(await self('/people'), 403);
    expectStatus(await team(`/employees/${other.id}`), 404);
    expectStatus(
      await request(`/leave/employees/${staff.id}`, 'GET', undefined, b.cookie),
      404,
    );
    expectStatus(await submit('2026-10-08'), 409);
    const entitlement = await setup();
    expectStatus(entitlement, 201);
    const balanceId = entitlement.body.id;
    expectStatus(await setup(), 409);
    expectStatus(
      await self(`/employees/${staff.id}/entitlements`, 'POST', {
        policy_id: policy,
        year: 2026,
        reason: 'Unauthorized',
      }),
      403,
    );
    assert.equal((await balance()).available, 12);
    expectStatus(
      await req(`/leave/policies/${policy}`, 'PUT', {
        ...policyBody,
        balance_controlled: false,
      }),
      409,
    );
    pass(
      'tenant/manager scope, linked employee access and one annual entitlement are enforced',
    );

    const holiday = await req('/holidays', 'POST', {
      name: 'Test holiday',
      holiday_date: '2026-10-09',
      location_id: null,
      description: 'Leave calculation',
    });
    expectStatus(holiday, 201);
    const preview = await self(
      '/preview',
      'POST',
      application('2026-10-08', '2026-10-12'),
    );
    expectStatus(preview, 201);
    assert.equal(preview.body.units, 2);
    assert.deepEqual(
      preview.body.days.map((d) => d.date),
      ['2026-10-08', '2026-10-12'],
    );
    assert.equal((await balance()).pending, 0);
    expectStatus(await submit('2026-10-10', '2026-10-11'), 400);
    expectStatus(await submit('2026-12-31', '2027-01-01'), 400);
    expectStatus(await submit('2026-02-30'), 400);
    expectStatus(
      await submit('2026-10-08', '2026-10-08', { start_half: 'am' }),
      400,
    );
    expectStatus(
      await submit('2026-10-08', '2026-10-12', {
        start_half: 'am',
        end_half: 'am',
      }),
      400,
    );
    expectStatus(
      await submit('2026-10-08', '2026-10-08', { employee_id: other.id }),
      400,
    );
    const first = await submit('2026-10-08', '2026-10-12');
    expectStatus(first, 201);
    assert.equal((await balance()).pending, 2);
    assert.equal((await balance()).used, 0);
    assert.equal((await balance()).available, 10);
    expectStatus(await submit('2026-10-12'), 409);
    expectStatus(await review(first.body.id, 'approved', staff.cookie), 403);
    expectStatus(await review(first.body.id, 'approved', b.cookie), 404);
    const updatedPolicy = await req(`/leave/policies/${policy}`, 'PUT', {
      ...policyBody,
      exclude_non_working_days: false,
    });
    expectStatus(updatedPolicy, 200);
    const approvals = await Promise.all([
      review(first.body.id),
      review(first.body.id),
    ]);
    assert.deepEqual(
      approvals.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    assert.equal((await balance()).used, 2);
    assert.equal((await balance()).pending, 0);
    const saved = (
      await db.query('SELECT calculation FROM leave_requests WHERE id=$1', [
        first.body.id,
      ])
    )[0].calculation;
    assert.equal(saved.exclude_non_working_days, true);
    assert.equal(saved.days.length, 2);
    await req(`/leave/policies/${policy}`, 'PUT', policyBody);
    pass(
      'holiday/weekend exclusions, strict dates, reservation, snapshot stability and concurrent approval',
    );

    const attendance = await request(
      '/attendance/me?month=2026-10',
      'GET',
      undefined,
      staff.cookie,
    );
    expectStatus(attendance, 200);
    assert.equal(
      attendance.body.items.find((d) => d.work_date === '2026-10-08').status,
      'leave',
    );
    const calendar = await team('/calendar?month=2026-10');
    expectStatus(calendar, 200);
    assert.equal(calendar.body.items.length, 2);
    assert(!JSON.stringify(calendar.body).includes('personal'));
    assert(!('type_name' in calendar.body.items[0]));
    expectStatus(await cancel(first.body.id), 403);
    expectStatus(await cancel(first.body.id, boss.cookie), 403);
    expectStatus(await cancel(first.body.id, a.cookie), 201);
    assert.equal((await balance()).used, 0);
    assert.equal((await balance()).available, 12);
    expectStatus(await cancel(first.body.id, a.cookie), 409);
    assert.equal((await team('/calendar?month=2026-10')).body.items.length, 0);
    const restored = await request(
      '/attendance/me?month=2026-10',
      'GET',
      undefined,
      staff.cookie,
    );
    assert.notEqual(
      restored.body.items.find((d) => d.work_date === '2026-10-08').status,
      'leave',
    );
    pass(
      'approved calendar protects reasons, attendance overlays and HR cancellation restores balance',
    );

    const half = await submit('2026-10-13', '2026-10-13', {
      start_half: 'am',
      end_half: 'am',
    });
    expectStatus(half, 201);
    assert.equal(half.body.units, 0.5);
    expectStatus(
      await submit('2026-10-13', '2026-10-13', {
        start_half: 'am',
        end_half: 'am',
      }),
      409,
    );
    const secondHalf = await submit('2026-10-13', '2026-10-13', {
      start_half: 'pm',
      end_half: 'pm',
    });
    expectStatus(secondHalf, 201);
    expectStatus(await cancel(secondHalf.body.id), 201);
    expectStatus(await review(half.body.id, 'rejected'), 201);
    assert.equal((await balance()).pending, 0);
    const retries = await Promise.all([
      submit('2026-10-14'),
      submit('2026-10-14'),
    ]);
    assert.deepEqual(
      retries.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    await cancel(retries.find((r) => r.status === 201).body.id);
    expectStatus(await submit('2026-11-02', '2026-11-30'), 409);
    pass(
      'half-day overlap, complementary halves, rejection/cancellation and concurrent submission',
    );
    expectStatus(await setup(boss.id), 201);
    const ownManager = await team(
      '/requests',
      'POST',
      application('2026-11-02'),
    );
    expectStatus(ownManager, 201);
    expectStatus(await review(ownManager.body.id), 403);
    expectStatus(await cancel(ownManager.body.id, boss.cookie), 201);
    expectStatus(await setup(other.id), 201);
    const unrelated = await request(
      '/leave/requests',
      'POST',
      application('2026-11-03'),
      other.cookie,
    );
    expectStatus(unrelated, 201);
    expectStatus(await review(unrelated.body.id), 404);
    expectStatus(await cancel(unrelated.body.id, other.cookie), 201);
    pass(
      'review permission never permits self-approval or unrelated employee review',
    );

    const { randomUUID } = require('node:crypto');
    const operationId = randomUUID();
    const adjustment = {
      units: 2,
      reason: 'Correct opening allocation',
      operation_id: operationId,
    };
    expectStatus(
      await req(`/leave/balances/${balanceId}/adjustments`, 'POST', adjustment),
      201,
    );
    expectStatus(
      await req(`/leave/balances/${balanceId}/adjustments`, 'POST', adjustment),
      201,
    );
    assert.equal((await balance()).available, 14);
    expectStatus(
      await req(`/leave/balances/${balanceId}/adjustments`, 'POST', {
        ...adjustment,
        units: 3,
      }),
      409,
    );
    expectStatus(
      await req(`/leave/balances/${balanceId}/adjustments`, 'POST', {
        ...adjustment,
        operation_id: randomUUID(),
        units: -15,
      }),
      409,
    );
    const ledger = await self(`/balances/${balanceId}/entries?limit=100`);
    expectStatus(ledger, 200);
    assert.equal(
      ledger.body.items.filter((e) => e.kind === 'adjust').length,
      1,
    );
    expectStatus(
      await request(
        `/leave/balances/${balanceId}/entries`,
        'GET',
        undefined,
        b.cookie,
      ),
      403,
    );
    pass(
      'idempotent audited balance adjustments, nonnegative available balance and scoped ledger',
    );

    // Attendance conflicts are checked again at approval, not just at submission.
    const conflict = await submit('2026-10-06');
    expectStatus(conflict, 201);
    const adjust = (date, check_in, check_out) =>
      req(`/attendance/employees/${staff.id}/days/${date}`, 'PUT', {
        mode: 'times',
        check_in,
        check_out,
        reason: 'Verified working time',
      });
    expectStatus(
      await adjust(
        '2026-10-06',
        '2026-10-06T09:00:00+05:30',
        '2026-10-06T18:00:00+05:30',
      ),
      200,
    );
    expectStatus(await review(conflict.body.id), 409);
    expectStatus(await review(conflict.body.id, 'rejected'), 201);
    const halfPast = await submit('2026-10-05', '2026-10-05', {
      start_half: 'am',
      end_half: 'am',
    });
    expectStatus(halfPast, 201);
    expectStatus(await review(halfPast.body.id), 201);
    expectStatus(
      await adjust(
        '2026-10-05',
        '2026-10-05T09:00:00+05:30',
        '2026-10-05T18:00:00+05:30',
      ),
      409,
    );
    expectStatus(
      await adjust(
        '2026-10-05',
        '2026-10-05T13:30:00+05:30',
        '2026-10-05T18:00:00+05:30',
      ),
      200,
    );
    const halfAttendance = await request(
      '/attendance/me?month=2026-10',
      'GET',
      undefined,
      staff.cookie,
    );
    assert.equal(
      halfAttendance.body.items.find((day) => day.work_date === '2026-10-05')
        .late_minutes,
      0,
    );
    expectStatus(await cancel(halfPast.body.id, a.cookie), 201);
    const afterHalfCancel = await request(
      '/attendance/me?month=2026-10',
      'GET',
      undefined,
      staff.cookie,
    );
    assert.equal(
      afterHalfCancel.body.items.find((day) => day.work_date === '2026-10-05')
        .late_minutes,
      255,
    );
    const fullToday = await submit('2026-10-07');
    expectStatus(fullToday, 201);
    expectStatus(await review(fullToday.body.id), 201);
    expectStatus(
      await request('/attendance/check-in', 'POST', {}, staff.cookie),
      409,
    );
    expectStatus(
      await request(
        '/attendance/regularizations',
        'POST',
        {
          work_date: '2026-10-07',
          check_in: '2026-10-07T08:00:00+05:30',
          check_out: '2026-10-07T09:00:00+05:30',
          reason: 'Cannot bypass leave',
        },
        staff.cookie,
      ),
      409,
    );
    pass(
      'leave/attendance conflicts are serialized, full-day writes blocked and half-day work remains possible',
    );

    const locked = await submit('2026-10-15');
    expectStatus(locked, 201);
    await db.query(
      "INSERT INTO payroll_runs(tenant_id,period_start,period_end,pay_date,status,currency,locked_by,locked_at) SELECT $1,'2026-10-01','2026-10-31','2026-10-31','locked','INR',id,now() FROM users WHERE tenant_id=$1 AND email='admin@example.test'",
      [a.id],
    );
    expectStatus(await review(locked.body.id), 409);
    expectStatus(await review(locked.body.id, 'rejected'), 201);
    expectStatus(await cancel(fullToday.body.id, a.cookie), 409);
    expectStatus(await submit('2026-10-16'), 409);
    pass(
      'locked payroll blocks new leave, approval and approved cancellation while permitting rejection',
    );

    const remaining = (await balance()).available;
    expectStatus(await setup(staff.id, 2027, { carry_forward: 2 }), 201);
    assert.equal((await balance()).available, remaining - 2);
    const next = (await self('/me?year=2027')).body.balances[0];
    assert.equal(next.available, 14);
    expectStatus(await setup(staff.id, 2027, { carry_forward: 2 }), 409);
    // Lifecycle API coverage lives in employee tests; fixture update isolates this check.
    await db.query("UPDATE employees SET status='inactive' WHERE id=$1", [
      other.id,
    ]);
    await setup(other.id);
    expectStatus(
      await request(
        '/leave/requests',
        'POST',
        application('2026-10-19'),
        other.cookie,
      ),
      403,
    );
    pass(
      'carry-forward transfers only available days once and inactive employees cannot apply',
    );

    const unpaidType = await req('/leave/types', 'POST', {
      code: 'TEST_UNPAID',
      name: 'Unpaid',
      description: 'Test',
      is_active: true,
    });
    expectStatus(unpaidType, 201);
    const unpaidPolicy = await req('/leave/policies', 'POST', {
      ...policyBody,
      leave_type_id: unpaidType.body.id,
      name: 'Uncontrolled unpaid',
      annual_entitlement: 0,
      is_paid: false,
      balance_controlled: false,
      exclude_non_working_days: false,
    });
    expectStatus(unpaidPolicy, 201);
    expectStatus(
      await setup(staff.id, 2026, { policy_id: unpaidPolicy.body.id }),
      201,
    );
    const unpaid = await submit('2026-12-01', '2026-12-31', {
      policy_id: unpaidPolicy.body.id,
    });
    expectStatus(unpaid, 201);
    assert.equal(unpaid.body.units, 31);
    expectStatus(await review(unpaid.body.id), 201);
    const unpaidBalance = (await self('/me?year=2026')).body.balances.find(
      (b) => b.leave_type_id === unpaidType.body.id,
    );
    assert.equal(unpaidBalance.pending, 0);
    assert.equal(unpaidBalance.used, 0);
    assert.equal(unpaidBalance.balance_controlled, false);
    const audits = await db.query(
      "SELECT action FROM audit_logs WHERE tenant_id=$1 AND entity_type='leave'",
      [a.id],
    );
    for (const action of [
      'requested',
      'approved',
      'rejected',
      'cancelled',
      'entitlement_created',
      'balance_adjusted',
    ])
      assert(audits.some((a) => a.action === 'leave.' + action));
    pass(
      'uncontrolled unpaid leave uses request history without artificial credits and required audit events exist',
    );
    console.log(`Leave integration checks passed: ${checks}`);
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

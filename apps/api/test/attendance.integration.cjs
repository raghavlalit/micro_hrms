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
  const database = `microhrms_attendance_test_${randomBytes(8).toString('hex')}`;
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
      request('/attendance' + path, method, body, staff.cookie);
    const team = (path, method = 'GET', body) =>
      request('/attendance' + path, method, body, boss.cookie);
    const adjust = (date, body) =>
      req(`/attendance/employees/${staff.id}/days/${date}`, 'PUT', {
        reason: 'HR attendance review',
        ...body,
      });
    const correction = (date, start = '09:00', end = '18:00') =>
      self('/regularizations', 'POST', {
        work_date: date,
        check_in: `${date}T${start}:00+05:30`,
        check_out: `${date}T${end}:00+05:30`,
        reason: 'Missed attendance entry',
      });
    const review = (id, decision = 'approved', cookie = boss.cookie) =>
      request(
        `/attendance/regularizations/${id}/review`,
        'POST',
        { decision, comment: 'Reviewed against work record' },
        cookie,
      );
    expectStatus(await request('/attendance/me'), 401);
    expectStatus(
      await request('/attendance/people', 'GET', undefined, platform.cookie),
      403,
    );
    expectStatus(await self('/people'), 403);
    expectStatus(await self(`/employees/${other.id}`), 404);
    expectStatus(await team(`/employees/${other.id}`), 404);
    expectStatus(
      await request(
        `/attendance/employees/${staff.id}`,
        'GET',
        undefined,
        b.cookie,
      ),
      404,
    );
    expectStatus(
      await self('/check-in', 'POST', {
        work_date: '2026-10-01',
        employee_id: other.id,
      }),
      400,
    );
    expectStatus(await self('/me?month=2026-13'), 400);
    expectStatus(
      await req(`/attendance/employees/${staff.id}/days/2026-02-30`, 'PUT', {
        mode: 'absent',
        reason: 'Invalid day',
      }),
      400,
    );
    expectStatus(await self('/check-out', 'POST', {}), 409);
    pass(
      'attendance access, tenant/report scope, strict DTOs and checkout ordering are enforced',
    );
    const simultaneous = await Promise.all([
      self('/check-in', 'POST', {}),
      self('/check-in', 'POST', {}),
    ]);
    assert.deepEqual(
      simultaneous.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    await db.query(
      'UPDATE work_schedules SET full_day_minutes=600 WHERE id=$1',
      [schedule],
    );
    expectStatus(
      await req('/holidays', 'POST', {
        name: 'Late calendar change',
        holiday_date: '2026-10-07',
        location_id: null,
      }),
      201,
    );
    now = new Date('2026-10-07T12:00:00Z');
    expectStatus(await self('/check-out', 'POST', {}), 201);
    expectStatus(await self('/check-out', 'POST', {}), 409);
    let calendar = (await self('/me?month=2026-10')).body,
      day = calendar.items.find((d) => d.work_date === '2026-10-07');
    assert.equal(day.worked_minutes, 510);
    assert.equal(day.status, 'present');
    assert.equal(day.late_minutes, 0);
    assert.equal(day.source, 'web');
    assert.equal(calendar.items.length, 31);
    const [persisted] = await db.query(
      'SELECT source_metadata FROM attendance WHERE employee_id=$1',
      [staff.id],
    );
    assert.equal(persisted.source_metadata.rules.full_day_minutes, 480);
    assert.equal(persisted.source_metadata.rules.holiday, false);
    await db.query(
      'UPDATE work_schedules SET full_day_minutes=480 WHERE id=$1',
      [schedule],
    );
    pass(
      'concurrent check-in creates one row and checkout uses original schedule/holiday snapshots',
    );
    assert.equal(
      calendar.items.find((d) => d.work_date === '2026-10-06').status,
      'absent',
    );
    assert.equal(
      calendar.items.find((d) => d.work_date === '2026-10-04').status,
      'weekly_off',
    );
    assert.equal(
      calendar.items.find((d) => d.work_date === '2026-10-08').status,
      'pending',
    );
    expectStatus(
      await adjust('2026-10-06', {
        mode: 'times',
        check_in: '2026-10-06T09:30:00+05:30',
        check_out: '2026-10-06T13:30:00+05:30',
      }),
      200,
    );
    day = (await self('/me?month=2026-10')).body.items.find(
      (d) => d.work_date === '2026-10-06',
    );
    assert.equal(day.status, 'half_day');
    assert.equal(day.late_minutes, 15);
    assert.equal(day.worked_minutes, 240);
    expectStatus(
      await adjust('2026-10-05', {
        mode: 'times',
        check_in: '2026-10-05T09:00:00+05:30',
        check_out: '2026-10-05T12:59:00+05:30',
      }),
      200,
    );
    assert.equal(
      (await self('/me?month=2026-10')).body.items.find(
        (d) => d.work_date === '2026-10-05',
      ).status,
      'absent',
    );
    expectStatus(
      await adjust('2026-10-04', {
        mode: 'times',
        check_in: '2026-10-04T09:00:00+05:30',
        check_out: '2026-10-04T18:00:00+05:30',
      }),
      200,
    );
    assert.equal(
      (await self('/me?month=2026-10')).body.items.find(
        (d) => d.work_date === '2026-10-04',
      ).status,
      'weekly_off',
    );
    expectStatus(await adjust('2026-10-03', { mode: 'leave' }), 200);
    assert.equal(
      (await self('/me?month=2026-10')).body.items.find(
        (d) => d.work_date === '2026-10-03',
      ).status,
      'leave',
    );
    expectStatus(
      await request(
        `/attendance/employees/${staff.id}/days/2026-10-02`,
        'PUT',
        { mode: 'absent', reason: 'Manager cannot adjust' },
        boss.cookie,
      ),
      403,
    );
    pass(
      'monthly projections, duration thresholds, late grace, weekly off and audited HR status adjustments work',
    );
    for (const body of [
      {
        work_date: '2026-10-02',
        check_in: '2026-10-02T09:00:00',
        check_out: '2026-10-02T18:00:00',
        reason: 'No offset',
      },
      {
        work_date: '2026-10-02',
        check_in: '2026-10-02T23:00:00+05:30',
        check_out: '2026-10-03T01:00:00+05:30',
        reason: 'Overnight',
      },
      {
        work_date: '2026-10-02',
        check_in: null,
        check_out: null,
        reason: 'Missing times',
      },
    ])
      expectStatus(await self('/regularizations', 'POST', body), 400);
    expectStatus(await correction('2026-10-08'), 400);
    expectStatus(await correction('2025-12-31'), 400);
    const pending = await correction('2026-10-02');
    expectStatus(pending, 201);
    expectStatus(await correction('2026-10-02'), 409);
    expectStatus(await self('/regularizations?scope=review'), 403);
    assert.equal((await team('/regularizations?scope=review')).body.total, 1);
    expectStatus(await review(pending.body.id, 'approved', staff.cookie), 403);
    expectStatus(await review(pending.body.id, 'approved', b.cookie), 404);
    expectStatus(await review(pending.body.id), 201);
    expectStatus(await review(pending.body.id), 409);
    assert.equal(
      (await self('/me?month=2026-10')).body.items.find(
        (d) => d.work_date === '2026-10-02',
      ).status,
      'present',
    );
    pass(
      'corrections require complete same-day times; direct-report approvals are scoped and single-use',
    );
    const stale = await correction('2026-10-01');
    expectStatus(stale, 201);
    expectStatus(await adjust('2026-10-01', { mode: 'absent' }), 200);
    expectStatus(await review(stale.body.id), 409);
    expectStatus(await review(stale.body.id, 'rejected'), 201);
    const fresh = await correction('2026-10-01');
    expectStatus(fresh, 201);
    const concurrent = await Promise.all([
      review(fresh.body.id),
      review(fresh.body.id),
    ]);
    assert.deepEqual(
      concurrent.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    const [history] = await db.query(
      'SELECT original_values FROM attendance_regularizations WHERE id=$1',
      [fresh.body.id],
    );
    assert.equal(history.original_values.attendance.status, 'absent');
    pass(
      'stale corrections cannot overwrite newer attendance and concurrent reviews apply once with original history',
    );
    now = new Date('2026-10-08T04:00:00Z');
    expectStatus(await self('/check-in', 'POST', {}), 201);
    now = new Date('2026-10-09T04:00:00Z');
    calendar = (await self('/me')).body;
    assert.equal(
      calendar.items.find((d) => d.work_date === '2026-10-08').status,
      'incomplete',
    );
    expectStatus(await self('/check-out', 'POST', {}), 409);
    expectStatus(await correction('2026-10-08'), 201);
    const [open] = await db.query(
      'SELECT check_out FROM attendance WHERE employee_id=$1 AND work_date=$2',
      [staff.id, '2026-10-08'],
    );
    assert.equal(open.check_out, null);
    pass(
      'missing checkout becomes incomplete without inventing hours and prior-day checkout requires correction',
    );
    const [{ id: adminId }] = await db.query(
      'SELECT id FROM users WHERE tenant_id=$1 AND email=$2',
      [a.id, 'admin@example.test'],
    );
    await db.query(
      "INSERT INTO payroll_runs(tenant_id,period_start,period_end,status,currency,locked_by,locked_at) VALUES($1,'2026-09-01','2026-09-30','locked','INR',$2,now())",
      [a.id, adminId],
    );
    expectStatus(await adjust('2026-09-15', { mode: 'absent' }), 409);
    expectStatus(await correction('2026-09-15'), 409);
    await db.query(
      'UPDATE employees SET work_schedule_id=NULL,location_id=NULL WHERE id=$1',
      [other.id],
    );
    expectStatus(
      await request('/attendance/check-in', 'POST', {}, other.cookie),
      409,
    );
    await db.query("UPDATE employees SET status='inactive' WHERE id=$1", [
      other.id,
    ]);
    expectStatus(
      await request('/attendance/check-in', 'POST', {}, other.cookie),
      403,
    );
    pass(
      'locked payroll dates, missing schedules and inactive employees cannot accept attendance writes',
    );
    const {
      calculateAttendance,
      monthDates,
    } = require('../dist/modules/attendance/attendance-calculation');
    const rules = {
      timezone: 'Asia/Kolkata',
      start_time: '09:00:00',
      late_grace_minutes: 15,
      half_day_minutes: 240,
      full_day_minutes: 480,
      holiday: false,
      weekly_off: false,
    };
    assert.equal(
      calculateAttendance(
        rules,
        new Date('2026-10-01T03:45:00Z'),
        new Date('2026-10-01T11:45:00Z'),
      ).late_minutes,
      0,
    );
    assert.equal(
      calculateAttendance(
        rules,
        new Date('2026-10-01T03:46:00Z'),
        new Date('2026-10-01T11:46:00Z'),
      ).late_minutes,
      1,
    );
    assert.equal(monthDates('2028-02').length, 29);
    const audits = await db.query(
      "SELECT action,metadata FROM audit_logs WHERE tenant_id=$1 AND entity_type='attendance'",
      [a.id],
    );
    for (const action of [
      'attendance.check_in',
      'attendance.check_out',
      'attendance.manual',
      'attendance.correction_requested',
      'attendance.correction_approved',
      'attendance.correction_rejected',
    ])
      assert(audits.some((r) => r.action === action));
    assert(
      audits.some(
        (r) =>
          r.action === 'attendance.manual' &&
          r.metadata.reason === 'HR attendance review',
      ),
    );
    pass(
      'calculation boundaries, leap years and required audit events are verified',
    );
    console.log(`Attendance integration checks passed: ${checks}`);
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

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
  const database = `microhrms_reports_test_${randomBytes(8).toString('hex')}`;
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
    process.env.PAYSLIP_STORAGE_DIR = require('node:path').resolve(
      '.tmp/reports-test-files',
      database,
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

    const callAs = (who, path) => request(path, 'GET', undefined, who.cookie);
    expectStatus(await request('/dashboard'), 401);
    expectStatus(await callAs(platform, '/dashboard'), 403);
    for (const kind of [
      'employees',
      'attendance',
      'leave',
      'balances',
      'payroll',
      'components',
    ]) {
      expectStatus(await callAs(staff, `/reports/${kind}`), 403);
      expectStatus(await callAs(staff, `/reports/options?kind=${kind}`), 403);
    }
    let result = await req('/reports/employees?limit=1&page=2');
    expectStatus(result, 200);
    assert.equal(result.body.total, 4); // Includes the onboarding administrator.
    assert.equal(result.body.rows.length, 1);
    assert.deepEqual(Object.keys(result.body.rows[0]), [
      'employee_code',
      'employee_name',
      'department',
      'designation',
      'location',
      'manager',
      'joining_date',
      'status',
    ]);
    result = await callAs(boss, '/reports/employees');
    expectStatus(result, 200);
    assert.equal(result.body.scope, 'team');
    assert.deepEqual(
      result.body.rows.map((row) => row.employee_code),
      ['STAFF'],
    );
    assert.equal(
      (await callAs(boss, `/reports/employees?employee_id=${other.id}`)).body
        .total,
      0,
    );
    assert.equal((await callAs(b, '/reports/employees')).body.total, 1);
    expectStatus(await callAs(boss, '/reports/payroll'), 403);
    expectStatus(await req('/reports/unknown'), 400);
    expectStatus(
      await req('/reports/attendance?from=2026-10-01&to=2026-11-02'),
      400,
    );
    expectStatus(
      await req('/reports/attendance?from=2026-02-30&to=2026-03-01'),
      400,
    );
    expectStatus(await req('/reports/employees?status=pending'), 400);
    expectStatus(await req('/reports/employees?year=2026'), 400);
    pass(
      'report/domain permissions, team and tenant isolation, allowlisted fields, pagination and invalid filters',
    );

    result = await req(
      `/reports/attendance?from=2026-01-31&to=2026-03-01&employee_id=${staff.id}`,
    );
    expectStatus(result, 200);
    assert.equal(result.body.total, 30);
    assert(result.body.rows.some((row) => row.work_date === '2026-02-01'));
    const calendar = (
      await req(`/attendance/employees/${staff.id}?month=2026-10`)
    ).body;
    result = await callAs(
      boss,
      '/reports/attendance?from=2026-10-01&to=2026-10-07',
    );
    expectStatus(result, 200);
    assert.equal(result.body.total, 7);
    for (const row of result.body.rows)
      assert.equal(
        row.status,
        calendar.items.find((day) => day.work_date === row.work_date).status,
      );
    assert.equal(
      result.body.rows.find((row) => row.work_date === '2026-10-07').status,
      'pending',
    );
    assert.equal(
      (
        await req(
          '/reports/attendance?from=2026-10-07&to=2026-10-07&status=absent',
        )
      ).body.total,
      0,
    );
    pass(
      'attendance reports reuse calendar rules, include intervening months, and do not mark pending employees absent',
    );

    const [type] = await db.query(
      'SELECT id FROM leave_types WHERE tenant_id=$1 LIMIT 1',
      [a.id],
    );
    const [policy] = await db.query(
      "INSERT INTO leave_policies(tenant_id,leave_type_id,name,effective_from) VALUES($1,$2,'Report policy','2026-01-01') RETURNING id",
      [a.id, type.id],
    );
    for (const person of [staff, other]) {
      await db.query(
        "INSERT INTO leave_balances(tenant_id,employee_id,leave_type_id,period_start,period_end,credited,used,pending,adjusted) VALUES($1,$2,$3,'2026-01-01','2026-12-31',12,2,1,0.5)",
        [a.id, person.id, type.id],
      );
      await db.query(
        "INSERT INTO leave_requests(tenant_id,employee_id,leave_type_id,policy_id,start_date,end_date,units,reason) VALUES($1,$2,$3,$4,'2026-10-09','2026-10-09',1,'Private medical reason')",
        [a.id, person.id, type.id, policy.id],
      );
      await db.query(
        "INSERT INTO attendance_regularizations(tenant_id,employee_id,work_date,reason) VALUES($1,$2,'2026-10-06','Private attendance reason')",
        [a.id, person.id],
      );
    }
    result = await callAs(boss, '/reports/leave?from=2026-10-01&to=2026-10-31');
    expectStatus(result, 200);
    assert.equal(result.body.total, 1);
    assert(!JSON.stringify(result.body).includes('Private'));
    result = await callAs(boss, '/reports/balances?year=2026');
    expectStatus(result, 200);
    assert.equal(result.body.total, 1);
    assert.equal(result.body.rows[0].available, '9.50');
    assert.equal(
      (await req('/reports/leave?from=2026-10-10&to=2026-10-31')).body.total,
      0,
    );
    pass(
      'leave and balances retain domain scope and exclude private request reasons',
    );

    await db.query(
      "UPDATE employees SET date_of_birth='1994-10-08',joining_date='2025-10-09' WHERE id=$1",
      [staff.id],
    );
    result = await req('/dashboard');
    expectStatus(result, 200);
    assert.equal(result.body.workforce.total, 4);
    assert.equal(result.body.workforce.active, 4);
    assert.equal(result.body.attendance.counts.pending, 3);
    assert.equal(result.body.attendance.counts.absent, 0);
    assert.equal(
      result.body.pending.find((row) => row.kind === 'leave').count,
      2,
    );
    assert.equal(
      result.body.pending.find((row) => row.kind === 'attendance').count,
      2,
    );
    assert.equal(result.body.milestones.length, 2);
    assert(!JSON.stringify(result.body).includes('1994'));
    result = await callAs(boss, '/dashboard');
    expectStatus(result, 200);
    assert.equal(result.body.workforce.total, 1);
    assert.equal(result.body.attendance.scope, 'team');
    assert.equal(result.body.pending[0].count, 1);
    assert.equal(result.body.pending[1].count, 1);
    assert.equal(result.body.payroll, null);
    assert.equal(result.body.milestones.length, 0);
    result = await callAs(staff, '/dashboard');
    expectStatus(result, 200);
    assert.equal(result.body.workforce.total, 1);
    assert.equal(result.body.attendance.scope, 'self');
    assert.equal(result.body.attendance.own.status, 'pending');
    assert.equal(result.body.balances.length, 1);
    assert.equal(result.body.balances[0].available, 9.5);
    assert.equal(result.body.pending.length, 0);
    result = await callAs(b, '/dashboard');
    expectStatus(result, 200);
    assert.equal(result.body.workforce.total, 1);
    assert.equal(result.body.linked_employee, true);
    pass(
      'company, manager and employee dashboards show correct counts, personal balances and privacy-safe milestones',
    );

    await db.query(
      "INSERT INTO leave_requests(tenant_id,employee_id,leave_type_id,policy_id,start_date,end_date,units,reason,status,calculation) VALUES($1,$2,$3,$4,'2026-10-07','2026-10-07',0.5,'Private half-day leave','approved',$5)",
      [
        a.id,
        staff.id,
        type.id,
        policy.id,
        { days: [{ date: '2026-10-07', units: 0.5, half: 'pm' }] },
      ],
    );
    result = await callAs(boss, '/dashboard');
    expectStatus(result, 200);
    assert.equal(result.body.attendance.counts.on_leave, 1);
    assert.equal(result.body.attendance.counts.half_day, 1);
    assert.equal(result.body.attendance.counts.absent, 0);
    result = await callAs(
      boss,
      '/reports/attendance?from=2026-10-07&to=2026-10-07',
    );
    expectStatus(result, 200);
    assert.equal(result.body.rows[0].leave_units, 0.5);
    assert.equal(result.body.rows[0].status, 'half_day');
    now = new Date('2026-12-20T03:30:00Z');
    await db.query(
      "INSERT INTO holidays(tenant_id,name,holiday_date) VALUES($1,'New year','2027-01-01')",
      [a.id],
    );
    await db.query(
      "UPDATE employees SET date_of_birth='1994-01-02' WHERE id=$1",
      [staff.id],
    );
    result = await req('/dashboard');
    expectStatus(result, 200);
    assert(
      result.body.holidays.some((row) => row.holiday_date === '2027-01-01'),
    );
    assert(result.body.milestones.some((row) => row.date === '2027-01-02'));
    assert(!JSON.stringify(result.body.milestones).includes('1994'));
    now = new Date('2026-10-07T03:30:00Z');
    const managerOptions = await callAs(
      boss,
      '/reports/options?kind=employees',
    );
    expectStatus(managerOptions, 200);
    assert.deepEqual(
      managerOptions.body.locations.map((row) => row.id),
      [location],
    );
    assert.deepEqual(managerOptions.body.runs, []);
    const emptyOptions = await callAs(b, '/reports/options?kind=employees');
    expectStatus(emptyOptions, 200);
    assert.deepEqual(emptyOptions.body.locations, []);
    pass(
      'approved half-day leave, upcoming year boundaries and scoped filter options',
    );

    const [run] = await db.query(
      "INSERT INTO payroll_runs(tenant_id,period_start,period_end,pay_date,currency,status,calculation_version) VALUES($1,'2026-09-01','2026-09-30','2026-10-01','INR','calculated',2) RETURNING id",
      [a.id],
    );
    const [old] = await db.query(
      'INSERT INTO payroll_employees(tenant_id,payroll_run_id,employee_id,gross,deductions,net,calculation_version) VALUES($1,$2,$3,10,0,10,1) RETURNING id',
      [a.id, run.id, staff.id],
    );
    const [item] = await db.query(
      'INSERT INTO payroll_employees(tenant_id,payroll_run_id,employee_id,gross,deductions,net,calculation_version,input_snapshot) VALUES($1,$2,$3,999999999999.99,100,999999999899.99,2,$4) RETURNING id',
      [
        a.id,
        run.id,
        staff.id,
        { employee: { name: 'Historical employee', employee_code: 'HISTORY' } },
      ],
    );
    for (const row of [old, item])
      for (const code of ['BASIC', 'BONUS'])
        await db.query(
          "INSERT INTO payroll_lines(tenant_id,payroll_employee_id,component_code,component_name,kind,amount) VALUES($1,$2,$3,$3,'earning',100)",
          [a.id, row.id, code],
        );
    result = await req(`/reports/payroll?run_id=${run.id}`);
    expectStatus(result, 200);
    assert.equal(result.body.total, 1);
    assert.equal(result.body.rows[0].employee_name, 'Historical employee');
    assert.equal(result.body.rows[0].net, '999999999899.99');
    result = await req(`/reports/components?run_id=${run.id}&limit=1`);
    expectStatus(result, 200);
    assert.equal(result.body.total, 2);
    assert.equal(result.body.rows.length, 1);
    expectStatus(await callAs(b, `/reports/payroll?run_id=${run.id}`), 404);
    expectStatus(await req('/reports/payroll'), 400);
    pass(
      'payroll uses current calculation and snapshot identity, preserves money precision and counts component rows correctly',
    );

    const exportReport = (kind, filters, cookie = a.cookie) =>
      fetch(base + `/reports/${kind}/export`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          'X-HRMS-Request': '1',
        },
        body: JSON.stringify(filters),
      });
    await db.query(
      'UPDATE employees SET first_name=$1,last_name=$2 WHERE id=$3',
      ['=SUM(1,2)', 'Patel, "Diya"', staff.id],
    );
    let csv = await exportReport('employees', { employee_id: staff.id });
    assert.equal(csv.status, 201);
    assert.match(csv.headers.get('content-type'), /text\/csv/);
    assert.match(
      csv.headers.get('content-disposition'),
      /employees-2026-10-07.csv/,
    );
    const bytes = Buffer.from(await csv.arrayBuffer());
    assert(bytes.subarray(0, 3).equals(Buffer.from([239, 187, 191])));
    assert.match(bytes.toString(), /"'=SUM\(1,2\) Patel, ""Diya"""/);
    csv = await exportReport('payroll', { run_id: run.id });
    assert.match(await csv.text(), /999999999899\.99/);
    assert.equal(
      (await exportReport('employees', {}, staff.cookie)).status,
      403,
    );
    const [audit] = await db.query(
      "SELECT metadata FROM audit_logs WHERE tenant_id=$1 AND action='report.exported' AND metadata->>'kind'='employees'",
      [a.id],
    );
    assert.equal(audit.metadata.rows, 1);
    assert.equal(audit.metadata.scope, 'company');
    const { reportCsv } = require('../dist/modules/reports/report-csv');
    assert.equal(
      reportCsv([{ key: 'value', label: 'Value' }], [{ value: '\t +formula' }]),
      '\uFEFF"Value"\r\n"\'\t +formula"\r\n',
    );
    assert.match(
      reportCsv(
        [{ key: 'value', label: 'Value', type: 'number' }],
        [{ value: '-0.50' }],
      ),
      /"-0.50"/,
    );
    pass(
      'CSV export is UTF-8, quoted, formula-safe, audited, permission protected and exact for money',
    );

    // Enforce report permission AND domain access even for custom combinations.
    const {
      ReportsService,
    } = require('../dist/modules/reports/reports.service');
    const service = app.get(ReportsService);
    const principal = {
      id: (
        await db.query('SELECT user_id FROM employees WHERE id=$1', [boss.id])
      )[0].user_id,
      tenantId: a.id,
      kind: 'tenant',
      permissions: ['reports.read.company'],
      mustChangePassword: false,
    };
    await assert.rejects(
      service.options(principal, 'payroll'),
      (error) => error.status === 403,
    );
    await assert.rejects(
      service.options(principal, 'employees'),
      (error) => error.status === 403,
    );
    principal.permissions.push('employees.read.team');
    assert.equal((await service.options(principal, 'employees')).scope, 'team');
    await db.query(
      "INSERT INTO employees(tenant_id,employee_code,first_name,last_name,email,joining_date,employment_type,status) SELECT $1,'BULK'||n,'Bulk','Person','bulk'||n||'@example.test','2026-01-01','Full-time','active' FROM generate_series(1,170) n",
      [a.id],
    );
    expectStatus(
      await req('/reports/attendance?from=2026-10-01&to=2026-10-31'),
      413,
    );
    expectStatus(
      await req(
        `/reports/attendance?from=2026-10-01&to=2026-10-31&employee_id=${staff.id}`,
      ),
      200,
    );
    pass(
      'custom roles cannot elevate scope and oversized reports require narrower filters',
    );
    await db.query(
      "INSERT INTO employees(tenant_id,employee_code,first_name,last_name,email,joining_date,employment_type,status) SELECT $1,'BULK'||n,'Bulk','Person','bulk'||n||'@example.test','2026-01-01','Full-time','active' FROM generate_series(171,500) n",
      [a.id],
    );
    result = await req('/dashboard');
    expectStatus(result, 200);
    assert.equal(result.body.workforce.total, 504);
    assert.equal(result.body.attendance.available, false);
    assert.equal(result.body.attendance.counts, null);
    await db.query('UPDATE employees SET archived_at=now() WHERE id=$1', [
      staff.id,
    ]);
    result = await req(`/reports/payroll?run_id=${run.id}`);
    expectStatus(result, 200);
    assert.equal(result.body.total, 1);
    assert.equal(result.body.rows[0].employee_name, 'Historical employee');
    assert.equal(
      (await req(`/reports/employees?employee_id=${staff.id}`)).body.total,
      0,
    );
    result = await callAs(staff, '/dashboard');
    expectStatus(result, 200);
    assert.equal(result.body.linked_employee, false);
    assert.equal(result.body.balances, null);
    assert.equal(result.body.attendance.own, null);
    pass(
      'large attendance dashboards never return partial totals and archived employees retain payroll history',
    );
    console.log(`Dashboard/report integration checks passed: ${checks}`);
  } finally {
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
    if (created) await admin.query(`DROP DATABASE "${database}" WITH (FORCE)`);
    if (admin.isInitialized) await admin.destroy();
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

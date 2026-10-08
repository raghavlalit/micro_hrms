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
  const database = `microhrms_payroll_test_${randomBytes(8).toString('hex')}`;
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
      '.tmp/payroll-test-files',
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
    const { randomUUID } = require('node:crypto');
    const {
      cents,
      money,
      divideRounded,
    } = require('../dist/modules/payroll/payroll-money');
    assert.equal(money(cents('0.10') + cents('0.20')), '0.30');
    assert.equal(money(divideRounded(cents('100.00'), 3n)), '33.33');
    assert.equal(money(divideRounded(1n, 2n)), '0.01');
    assert.throws(() => cents('1.001'));
    const components = (await req('/payroll/components')).body,
      earning = components.find((c) => c.kind === 'earning'),
      deduction = components.find((c) => c.kind === 'deduction');
    const salaryBody = (
      effective_from = '2026-01-01',
      amount = '30000.00',
      deduct = '3000.00',
    ) => ({
      effective_from,
      lines: [
        { component_id: earning.id, amount },
        { component_id: deduction.id, amount: deduct },
      ],
      reason: 'Approved monthly salary',
    });
    const salary = (id, body = salaryBody()) =>
      req(`/payroll/employees/${id}/salaries`, 'POST', body);
    const details = async (id) => {
      const result = await req(`/payroll/runs/${id}`);
      expectStatus(result, 200);
      return result.body;
    };
    const transition = async (id, action, extra = {}) => {
      const { run } = await details(id);
      return req(
        `/payroll/runs/${id}/${action}`,
        'POST',
        action === 'calculate'
          ? {
              revision: run.calculation_config.revision,
              discard_adjustments: false,
              reason: 'Reviewed test calculation',
              ...extra,
            }
          : {
              revision: run.calculation_config.revision,
              calculation_version: run.calculation_version,
              reason: 'Reviewed payroll totals',
              ...extra,
            },
      );
    };
    expectStatus(await request('/payroll/runs'), 401);
    expectStatus(
      await request('/payroll/runs', 'GET', undefined, staff.cookie),
      403,
    );
    expectStatus(
      await request('/payroll/runs', 'GET', undefined, boss.cookie),
      403,
    );
    expectStatus(
      await request('/payroll/runs', 'GET', undefined, platform.cookie),
      403,
    );
    expectStatus(
      await request(
        `/payroll/employees/${staff.id}/salaries`,
        'GET',
        undefined,
        b.cookie,
      ),
      404,
    );
    assert.equal(
      (await req('/payroll/settings')).body.unpaid_leave_deduction,
      false,
    );
    await db.query(
      "UPDATE employees SET joining_date='2026-09-16' WHERE id=$1",
      [staff.id],
    );
    await db.query(
      "UPDATE employees SET status='terminated',termination_date='2026-09-10' WHERE id=$1",
      [other.id],
    );
    expectStatus(await salary(boss.id), 201);
    expectStatus(await salary(other.id), 201);
    expectStatus(await salary(staff.id, salaryBody('2026-09-01')), 400);
    const duplicate = await Promise.all([
      req('/payroll/runs', 'POST', {
        month: '2026-08',
        pay_date: '2026-09-01',
      }),
      req('/payroll/runs', 'POST', {
        month: '2026-08',
        pay_date: '2026-09-01',
      }),
    ]);
    assert.deepEqual(
      duplicate.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    const august = duplicate.find((r) => r.status === 201).body.id;
    expectStatus(
      await req('/payroll/runs', 'POST', {
        month: '2026-13',
        pay_date: '2026-09-01',
      }),
      400,
    );
    expectStatus(
      await req('/payroll/runs', 'POST', {
        month: '2026-09',
        pay_date: '2026-08-01',
      }),
      400,
    );
    pass(
      'decimal-safe helpers, tenant/role isolation, effective dates and unique monthly runs',
    );

    const leaveTypes = (await req('/leave/types')).body;
    const leavePolicy = await req('/leave/policies', 'POST', {
      leave_type_id: leaveTypes[0].id,
      name: 'Unpaid payroll test',
      annual_entitlement: 0,
      is_paid: false,
      balance_controlled: false,
      carry_forward_enabled: false,
      exclude_non_working_days: true,
      effective_from: '2026-01-01',
      effective_to: null,
    });
    expectStatus(leavePolicy, 201);
    for (const person of [boss, staff])
      expectStatus(
        await req(`/leave/employees/${person.id}/entitlements`, 'POST', {
          policy_id: leavePolicy.body.id,
          year: 2026,
          credited: 0,
          carry_forward: 0,
          reason: 'Assign unpaid policy',
        }),
        201,
      );
    const applyLeave = (cookie, date, half = 'full') =>
      request(
        '/leave/requests',
        'POST',
        {
          policy_id: leavePolicy.body.id,
          start_date: date,
          end_date: date,
          start_half: half,
          end_half: half,
          reason: 'Unpaid personal leave',
        },
        cookie,
      );
    const bossLeave = await applyLeave(boss.cookie, '2026-08-05');
    expectStatus(bossLeave, 201);
    expectStatus(
      await req(`/leave/requests/${bossLeave.body.id}/review`, 'POST', {
        decision: 'approved',
        comment: 'Approved',
      }),
      201,
    );
    expectStatus(await transition(august, 'calculate'), 201);
    const augDetails = await details(august);
    assert.equal(augDetails.run.gross_total, '60000.00');
    assert.equal(augDetails.run.deduction_total, '6000.00');
    assert(
      !augDetails.items.some((item) =>
        item.lines.some(
          (line) => line.component_code === 'SYSTEM_UNPAID_LEAVE',
        ),
      ),
    );
    expectStatus(
      await req('/payroll/settings', 'PUT', { unpaid_leave_deduction: true }),
      200,
    );
    assert.equal(
      (await details(august)).run.calculation_config.unpaid_leave_deduction,
      false,
    );
    const septCreate = await req('/payroll/runs', 'POST', {
      month: '2026-09',
      pay_date: '2026-10-01',
    });
    expectStatus(septCreate, 201);
    const sept = septCreate.body.id;
    expectStatus(await transition(sept, 'calculate'), 409);
    assert.equal((await details(sept)).run.calculation_version, 0);
    assert.equal((await details(sept)).items.length, 0);
    const firstSalary = await salary(staff.id, salaryBody('2026-09-16'));
    expectStatus(firstSalary, 201);
    const secondSalary = await salary(
      staff.id,
      salaryBody('2026-09-21', '60000.00', '6000.00'),
    );
    expectStatus(secondSalary, 201);
    const histories = await req(`/payroll/employees/${staff.id}/salaries`);
    assert.equal(histories.body.items[1].effective_to, '2026-09-20');
    expectStatus(await salary(staff.id, salaryBody('2026-09-20')), 409);
    expectStatus(
      await req(`/payroll/components/${earning.id}`, 'PUT', {
        code: earning.code,
        name: earning.name,
        kind: 'deduction',
        is_active: true,
      }),
      409,
    );
    const leave = await applyLeave(staff.cookie, '2026-09-22', 'am');
    expectStatus(leave, 201);
    expectStatus(await transition(sept, 'calculate'), 201);
    let detail = await details(sept);
    assert.equal(detail.run.gross_total, '65000.00');
    assert.equal(detail.run.deduction_total, '6500.00');
    assert.equal(detail.run.net_total, '58500.00');
    assert.equal(detail.run.calculation_config.pending_leave, 1);
    const staffItem = detail.items.find((i) => i.employee_id === staff.id);
    assert.equal(staffItem.gross, '25000.00');
    assert.equal(staffItem.deductions, '2500.00');
    assert.equal(staffItem.input_snapshot.employed_days, 15);
    pass(
      'unpaid deduction defaults off, run settings snapshot, missing salary rollback and joining/termination/mid-month proration',
    );

    expectStatus(await transition(sept, 'lock'), 409);
    expectStatus(await transition(sept, 'review'), 201);
    expectStatus(await transition(sept, 'lock'), 409);
    expectStatus(
      await req(`/leave/requests/${leave.body.id}/review`, 'POST', {
        decision: 'approved',
        comment: 'Approved',
      }),
      201,
    );
    expectStatus(await transition(sept, 'lock'), 409);
    expectStatus(await transition(sept, 'calculate'), 201);
    detail = await details(sept);
    assert.equal(detail.run.deduction_total, '7500.00');
    assert.equal(detail.run.net_total, '57500.00');
    assert.equal(detail.run.calculation_version, 2);
    assert.deepEqual(detail.versions, [2, 1]);
    assert.equal(
      (await req(`/payroll/runs/${sept}/versions/1`)).body.items.find(
        (i) => i.employee_id === staff.id,
      ).deductions,
      '2500.00',
    );
    pass(
      'pending requests and stale inputs block lock, approved half-day unpaid leave deducts exactly and earlier calculations remain accessible',
    );

    let item = detail.items.find((i) => i.employee_id === staff.id);
    const operation = randomUUID();
    const adjustment = {
      operation_id: operation,
      name: 'Reviewed bonus',
      kind: 'earning',
      amount: '100.01',
      reason: 'Approved one-time bonus',
      calculation_version: detail.run.calculation_version,
      revision: detail.run.calculation_config.revision,
    };
    const added = await Promise.all([
      req(`/payroll/employees/${item.id}/adjustments`, 'POST', adjustment),
      req(`/payroll/employees/${item.id}/adjustments`, 'POST', adjustment),
    ]);
    added.forEach((result) => expectStatus(result, 201));
    expectStatus(
      await req(`/payroll/runs/${sept}/review`, 'POST', {
        calculation_version: detail.run.calculation_version,
        revision: detail.run.calculation_config.revision,
        reason: 'Stale screen',
      }),
      409,
    );
    detail = await details(sept);
    assert.equal(detail.run.net_total, '57600.01');
    assert.equal(
      detail.items
        .find((i) => i.employee_id === staff.id)
        .lines.filter((line) => line.id === operation).length,
      1,
    );
    expectStatus(await transition(sept, 'calculate'), 409);
    expectStatus(
      await req(`/payroll/employees/${item.id}/adjustments`, 'POST', {
        ...adjustment,
        operation_id: randomUUID(),
        revision: detail.run.calculation_config.revision,
        kind: 'deduction',
        amount: '999999.00',
      }),
      409,
    );
    assert.equal((await details(sept)).run.net_total, '57600.01');
    expectStatus(
      await req(`/payroll/adjustments/${operation}`, 'PUT', {
        revision: detail.run.calculation_config.revision,
        calculation_version: 2,
        expected_amount: '100.01',
        amount: '0.00',
        reason: 'Void bonus pending review',
      }),
      200,
    );
    assert.equal((await details(sept)).run.net_total, '57500.00');
    const revised = salaryBody('2026-09-21', '61000.00', '6000.00');
    delete revised.effective_from;
    expectStatus(
      await req(`/payroll/salaries/${secondSalary.body.id}`, 'PUT', revised),
      200,
    );
    expectStatus(await transition(sept, 'review'), 409);
    expectStatus(
      await transition(sept, 'calculate', { discard_adjustments: true }),
      201,
    );
    detail = await details(sept);
    assert.equal(detail.run.gross_total, '65333.33');
    assert.equal(detail.run.deduction_total, '7516.67');
    assert.equal(detail.run.net_total, '57816.66');
    expectStatus(
      await req(`/payroll/employees/${item.id}/adjustments`, 'POST', {
        ...adjustment,
        operation_id: randomUUID(),
        revision: detail.run.calculation_config.revision,
        calculation_version: 3,
      }),
      409,
    );
    pass(
      'idempotent manual adjustments, stale review protection, negative-net rollback, voiding and salary change detection',
    );

    expectStatus(await transition(sept, 'publish'), 409);
    assert.equal(
      (await request('/payslips/me', 'GET', undefined, staff.cookie)).body.items
        .length,
      0,
    );
    expectStatus(await transition(sept, 'review'), 201);
    const beforeLock = (await details(sept)).run;
    const locked = await Promise.all([
      req(`/payroll/runs/${sept}/lock`, 'POST', {
        revision: beforeLock.calculation_config.revision,
        calculation_version: 3,
        reason: 'Final approval',
      }),
      req(`/payroll/runs/${sept}/lock`, 'POST', {
        revision: beforeLock.calculation_config.revision,
        calculation_version: 3,
        reason: 'Final approval',
      }),
    ]);
    assert.deepEqual(
      locked.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    expectStatus(await transition(sept, 'calculate'), 409);
    expectStatus(
      await req(`/payroll/salaries/${secondSalary.body.id}`, 'PUT', revised),
      409,
    );
    expectStatus(await salary(staff.id, salaryBody('2026-09-25')), 409);
    expectStatus(
      await salary(staff.id, salaryBody('2026-10-01', '62000.00', '6000.00')),
      201,
    );
    expectStatus(
      await req(`/leave/requests/${leave.body.id}/cancel`, 'POST', {
        reason: 'Cannot change locked period',
      }),
      409,
    );
    expectStatus(
      await req(`/attendance/employees/${staff.id}/days/2026-09-23`, 'PUT', {
        mode: 'absent',
        reason: 'Cannot edit locked period',
      }),
      409,
    );
    await assert.rejects(
      () =>
        db.query(
          'UPDATE payroll_lines SET amount=amount+1 WHERE payroll_employee_id IN (SELECT id FROM payroll_employees WHERE payroll_run_id=$1)',
          [sept],
        ),
      (error) => error.code === '23514',
    );
    pass(
      'concurrent locking is single-use, immutable amounts and attendance/leave locks are enforced',
    );

    expectStatus(await transition(sept, 'publish'), 201);
    expectStatus(await transition(sept, 'publish'), 201);
    const own = await request('/payslips/me', 'GET', undefined, staff.cookie);
    expectStatus(own, 200);
    assert.equal(own.body.items.length, 1);
    const slip = own.body.items[0];
    assert.equal(slip.net, '21816.66');
    const view = await request(
      `/payslips/${slip.id}`,
      'GET',
      undefined,
      staff.cookie,
    );
    expectStatus(view, 200);
    assert(!('file_key' in view.body));
    assert(!('input_snapshot' in view.body));
    expectStatus(
      await request(`/payslips/${slip.id}`, 'GET', undefined, boss.cookie),
      404,
    );
    expectStatus(
      await request(`/payslips/${slip.id}`, 'GET', undefined, b.cookie),
      404,
    );
    expectStatus(
      await request(`/payslips/${slip.id}`, 'GET', undefined, platform.cookie),
      403,
    );
    const download = await fetch(base + `/payslips/${slip.id}/download`, {
      headers: { Cookie: staff.cookie },
    });
    assert.equal(download.status, 200);
    assert.match(download.headers.get('content-type'), /application\/pdf/);
    assert.equal(download.headers.get('cache-control'), 'no-store');
    const bytes = Buffer.from(await download.arrayBuffer());
    assert.equal(bytes.subarray(0, 5).toString(), '%PDF-');
    assert(bytes.length > 1000);
    require('node:fs').mkdirSync('.tmp/payroll-review', { recursive: true });
    require('node:fs').writeFileSync(
      '.tmp/payroll-review/sample-payslip.pdf',
      bytes,
    );
    // A footer must not create an extra page containing only the page number.
    assert.equal(
      (bytes.toString('latin1').match(/\/Type \/Page\b/g) || []).length,
      1,
    );
    await db.query(
      "UPDATE employees SET first_name='Changed after payroll' WHERE id=$1",
      [staff.id],
    );
    assert.equal(
      (await request(`/payslips/${slip.id}`, 'GET', undefined, staff.cookie))
        .body.employee.name,
      view.body.employee.name,
    );
    const again = await fetch(base + `/payslips/${slip.id}/download`, {
      headers: { Cookie: staff.cookie },
    });
    assert(bytes.equals(Buffer.from(await again.arrayBuffer())));
    pass(
      'private PDF publication is idempotent, employee ownership is enforced and immutable payslips survive later profile edits',
    );

    const audits = await db.query(
      "SELECT action FROM audit_logs WHERE tenant_id=$1 AND entity_type='payroll'",
      [a.id],
    );
    for (const action of [
      'salary_created',
      'salary_updated',
      'run_created',
      'calculated',
      'adjustment_added',
      'adjustment_updated',
      'reviewed',
      'locked',
      'payslips_published',
    ])
      assert(audits.some((row) => row.action === 'payroll.' + action));
    const currentMonth = new Date().toISOString().slice(0, 7),
      current = await req('/payroll/runs', 'POST', {
        month: currentMonth,
        pay_date: currentMonth + '-28',
      });
    expectStatus(current, 201);
    expectStatus(await transition(current.body.id, 'calculate'), 201);
    expectStatus(await transition(current.body.id, 'review'), 201);
    expectStatus(await transition(current.body.id, 'lock'), 409);
    pass(
      'critical payroll actions are audited and future/current-month locking is blocked',
    );
    console.log(`Payroll integration checks passed: ${checks}`);
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

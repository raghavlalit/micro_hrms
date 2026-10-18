/* Real API + PostgreSQL checks. Only creates/drops a random disposable local database. */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
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
  const database = `microhrms_jobs_test_${randomBytes(8).toString('hex')}`;
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
    process.env.EMAIL_DRIVER = 'disabled';
    process.env.BACKGROUND_QUEUE_PREFIX = database;
    process.env.REPORT_EXPORT_STORAGE_DIR = require('node:path').resolve(
      '.tmp/jobs-test-files',
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
      _other = await employee('OTHER');

    const {
      BackgroundJobs,
    } = require('../dist/modules/background-jobs/background-jobs.service');
    const {
      BackgroundProcessor,
    } = require('../dist/modules/background-jobs/background-processor.service');
    const {
      BackgroundWorker,
    } = require('../dist/modules/background-jobs/background-worker');
    const {
      PayslipGeneration,
    } = require('../dist/modules/payroll/payslip-generation.service');
    const {
      ReportExports,
    } = require('../dist/modules/reports/report-export.service');
    const jobs = app.get(BackgroundJobs),
      exports = app.get(ReportExports);
    const processor = new BackgroundProcessor(
      jobs,
      app.get(PayslipGeneration),
      exports,
    );
    const enqueue = (body = {}, who = a) =>
      request(
        '/reports/employees/export-jobs',
        'POST',
        { operation_id: randomUUID(), ...body },
        who.cookie,
      );
    const status = async (id) => (await req(`/report-exports/${id}`)).body;
    const stored = async (id) =>
      (await db.query('SELECT * FROM background_jobs WHERE id=$1', [id]))[0];
    const download = (id, who = a) =>
      fetch(base + `/report-exports/${id}/download`, {
        headers: { Cookie: who.cookie },
      });
    const ready = (id) =>
      db.query(
        "UPDATE background_jobs SET available_at=now()-interval '1 minute' WHERE id=$1",
        [id],
      );
    const operation_id = randomUUID();
    const queued = await enqueue({ operation_id });
    expectStatus(queued, 202);
    const id = queued.body.id;
    assert.equal((await enqueue({ operation_id })).body.id, id);
    expectStatus(await enqueue({ operation_id, search: 'changed' }), 409);
    expectStatus(await enqueue({ tenant_id: b.id }), 400);
    expectStatus(await enqueue({}, platform), 403);
    expectStatus(await enqueue({}, staff), 403);
    expectStatus(
      await request(`/report-exports/${id}`, 'GET', undefined, b.cookie),
      404,
    );
    expectStatus(
      await request(`/report-exports/${id}`, 'GET', undefined, boss.cookie),
      404,
    );
    assert.equal((await download(id)).status, 409);
    assert(!JSON.stringify(queued.body).includes('payload'));
    const noCsrf = await fetch(base + '/reports/employees/export-jobs', {
      method: 'POST',
      headers: { Cookie: a.cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation_id: randomUUID() }),
    });
    assert.equal(noCsrf.status, 403);
    pass(
      'queue validates permissions, CSRF, tenant/owner isolation and idempotent operation IDs',
    );

    // 5,005 employees exceeds the HTTP export limit but remains within the worker limit.
    await db.query(
      `INSERT INTO employees(tenant_id,employee_code,first_name,last_name,joining_date,employment_type,status)
      SELECT $1,'LOAD-'||n,'=Formula','Employee '||n,'2026-01-01','Full-time','active' FROM generate_series(1,5001) n`,
      [a.id],
    );
    expectStatus(await req('/reports/employees'), 413);
    expectStatus(await req('/reports/employees/export', 'POST', {}), 413);
    await processor.process(a.id, id);
    let result = await status(id);
    assert.equal(result.status, 'completed');
    assert.equal(result.total_units, 5005);
    const file = await download(id);
    assert.equal(file.status, 200);
    assert.equal(file.headers.get('cache-control'), 'no-store');
    const csv = await file.text();
    assert.equal(csv.trim().split('\n').length, 5006);
    assert(csv.includes("'=Formula Employee"));
    assert(!csv.includes('password_hash'));
    assert(!csv.includes('bank_details'));
    assert(!JSON.stringify(result).includes('object_key'));
    await processor.process(a.id, id);
    assert.equal((await stored(id)).attempts, 1);
    pass(
      '5,005-row CSV succeeds outside HTTP, is formula-safe/private, and duplicate execution is harmless',
    );

    const team = await enqueue({}, boss);
    expectStatus(team, 202);
    await processor.process(a.id, team.body.id);
    assert.equal((await download(team.body.id, boss)).status, 200);
    await db.query('UPDATE employees SET manager_id=NULL WHERE id=$1', [
      staff.id,
    ]);
    assert.equal((await download(team.body.id, boss)).status, 403);
    await db.query('UPDATE employees SET manager_id=$1 WHERE id=$2', [
      boss.id,
      staff.id,
    ]);
    const revoked = await enqueue({}, boss);
    await db.query(
      "UPDATE users SET status='disabled' WHERE id=(SELECT user_id FROM employees WHERE id=$1)",
      [boss.id],
    );
    await processor.process(a.id, revoked.body.id);
    assert.equal((await stored(revoked.body.id)).error_code, 'ACCESS_CHANGED');
    assert.equal((await stored(revoked.body.id)).status, 'failed');
    await db.query(
      "UPDATE users SET status='active' WHERE id=(SELECT user_id FROM employees WHERE id=$1)",
      [boss.id],
    );
    pass(
      'worker rechecks account access and saved downloads recheck current team membership',
    );

    const retry = await enqueue({ search: 'STAFF' });
    const save = exports.storage.save.bind(exports.storage);
    exports.storage.save = async () => {
      throw new Error('Synthetic filesystem failure with sensitive details');
    };
    for (let attempt = 1; attempt <= 3; attempt++) {
      await ready(retry.body.id);
      await processor.process(a.id, retry.body.id);
      assert.equal((await status(retry.body.id)).attempts, attempt);
    }
    result = await status(retry.body.id);
    assert.equal(result.status, 'failed');
    assert.equal(result.error_code, 'GENERATION_FAILED');
    assert(!JSON.stringify(result).includes('sensitive'));
    exports.storage.save = save;
    expectStatus(
      await req(`/report-exports/${retry.body.id}/retry`, 'POST', {}),
      202,
    );
    await processor.process(a.id, retry.body.id);
    assert.equal((await status(retry.body.id)).status, 'completed');
    expectStatus(
      await req(`/report-exports/${retry.body.id}/retry`, 'POST', {}),
      409,
    );
    pass(
      'three bounded attempts expose sanitized errors and an authorized manual retry completes',
    );

    const oldKey = (await stored(id)).result.object_key;
    await db.query(
      "UPDATE background_jobs SET expires_at=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
    assert.equal((await status(id)).status, 'expired');
    assert.equal((await download(id)).status, 410);
    await processor.process(a.id, id);
    assert.equal((await stored(id)).status, 'expired');
    await assert.rejects(() => exports.storage.read(oldKey));
    pass(
      'expired downloads are denied immediately and worker cleanup removes their files',
    );

    const lease = await enqueue({ search: 'STAFF' });
    // Simulate an already-due lease, avoiding a same-millisecond comparison
    // between the PostgreSQL container clock and the test process clock.
    await ready(lease.body.id);
    const first = await jobs.claim(a.id, lease.body.id);
    assert.equal(await jobs.claim(a.id, lease.body.id), null);
    await ready(lease.body.id);
    const second = await jobs.claim(a.id, lease.body.id);
    assert.notEqual(first.lease_token, second.lease_token);
    await assert.rejects(() => jobs.progress(first, 1, 1));
    await assert.rejects(() =>
      jobs.tenants.withTenant(a.id, (manager) =>
        jobs.complete(manager, first, {}, 0),
      ),
    );
    await exports.generate(second);
    assert.equal((await status(lease.body.id)).status, 'completed');
    pass(
      'expired leases can be reclaimed and stale workers cannot update progress or publish',
    );

    const pending = [];
    for (let index = 0; index < 3; index++) {
      const item = await enqueue({ search: 'STAFF' });
      expectStatus(item, 202);
      pending.push(item.body.id);
    }
    expectStatus(await enqueue(), 409);
    const runtime = app.get(DataSource);
    const candidates = await runtime
      .createQueryBuilder()
      .from('background_job_candidates', 'job')
      .select(['job.id AS id', 'job.tenant_id AS tenant_id'])
      .getRawMany();
    assert(candidates.some((row) => pending.includes(row.id)));
    assert(
      candidates.every(
        (row) => Object.keys(row).sort().join(',') === 'id,tenant_id',
      ),
    );
    const worker = new BackgroundWorker(runtime, processor);
    try {
      worker.onModuleInit();
      const deadline = Date.now() + 30000;
      let complete = false;
      while (Date.now() < deadline) {
        complete = (await Promise.all(pending.map(status))).every(
          (row) => row.status === 'completed',
        );
        if (complete) break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      assert(complete, 'Real Redis worker did not complete rediscovered jobs');
    } finally {
      await worker.onModuleDestroy();
      const { Queue } = require('bullmq');
      const cleanup = new Queue('document-report-generation', {
        prefix: database,
        connection: { host: '127.0.0.1', port: 6380 },
      });
      try {
        await cleanup.obliterate({ force: true });
      } finally {
        await cleanup.close();
      }
    }
    pass(
      'request capacity is bounded and real Redis worker rediscovers and processes durable database jobs',
    );
    console.log(`Background job integration checks passed: ${checks}`);
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

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
  const database = `microhrms_notifications_test_${randomBytes(8).toString('hex')}`;
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
      '.tmp/notifications-test-files',
      database,
    );
    process.env.EMAIL_DRIVER = 'smtp';
    process.env.NOTIFICATION_DATA_KEYS = JSON.stringify({
      v1: randomBytes(32).toString('base64'),
    });
    process.env.NOTIFICATION_KEY_VERSION = 'v1';
    process.env.WEB_ORIGIN = 'http://localhost:4200';
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
      TenantDatabaseService,
    } = require('../dist/modules/tenants/tenant-database.service');
    const {
      NotificationConfig,
    } = require('../dist/modules/notifications/notification-config');
    const {
      NotificationSecret,
    } = require('../dist/modules/notifications/notification-secret');
    const {
      NotificationRecipients,
    } = require('../dist/modules/notifications/notification-recipients');
    const {
      NotificationEvents,
    } = require('../dist/modules/notifications/notification-events.service');
    const {
      NotificationDelivery,
    } = require('../dist/modules/notifications/notification-delivery.service');
    const {
      InvitationsService,
    } = require('../dist/modules/auth/invitations.service');
    const tenants = app.get(TenantDatabaseService),
      config = app.get(NotificationConfig),
      secrets = app.get(NotificationSecret),
      recipients = app.get(NotificationRecipients),
      events = app.get(NotificationEvents);
    const sent = [];
    let fail = false;
    const delivery = new NotificationDelivery(
      tenants,
      config,
      secrets,
      recipients,
      {
        send: async (message) => {
          if (fail)
            throw new Error('Provider error contains private credentials');
          sent.push(message);
        },
      },
    );
    const as = (who, path, method = 'GET', body) =>
      request(path, method, body, who.cookie);
    const [staffRow] = await db.query(
      'SELECT user_id FROM employees WHERE id=$1',
      [staff.id],
    );
    const [bossRow] = await db.query(
      'SELECT user_id FROM employees WHERE id=$1',
      [boss.id],
    );
    const jobs = async () =>
      db.query(
        "SELECT * FROM outbox_events WHERE tenant_id=$1 AND event_type='notification.email' ORDER BY created_at,id",
        [a.id],
      );
    const jobFor = async (kind, recipient) =>
      (await jobs()).find(
        (job) =>
          job.payload.kind === kind && job.payload.recipient_id === recipient,
      );
    expectStatus(await request('/notifications'), 401);
    expectStatus(await as(platform, '/notifications'), 403);
    let response = await as(staff, '/notifications');
    expectStatus(response, 200);
    assert.equal(response.body.total, 1);
    assert.equal(response.body.items[0].type, 'invitation');
    assert(!JSON.stringify(response.body).includes('token'));
    const ownId = response.body.items[0].id;
    expectStatus(
      await as(other, `/notifications/${ownId}/read`, 'PUT', { read: true }),
      404,
    );
    expectStatus(
      await as(b, `/notifications/${ownId}/read`, 'PUT', { read: true }),
      404,
    );
    expectStatus(
      await as(staff, `/notifications/${ownId}/read`, 'PUT', { read: true }),
      200,
    );
    assert.equal(
      (await as(staff, '/notifications/unread-count')).body.unread,
      0,
    );
    expectStatus(
      await as(staff, `/notifications/${ownId}/read`, 'PUT', { read: false }),
      200,
    );
    assert.equal(
      (await as(staff, '/notifications?status=unread')).body.total,
      1,
    );
    expectStatus(await as(staff, '/notifications/read-all', 'PUT', {}), 200);
    assert.equal((await as(staff, '/notifications?status=read')).body.total, 1);
    expectStatus(await as(staff, '/notifications/deliveries'), 403);
    expectStatus(await req('/notifications?limit=101'), 400);
    pass(
      'personal inbox, read/unread/count/read-all, tenant ownership and delivery-admin permissions',
    );

    const [type] = await db.query(
      'SELECT id FROM leave_types WHERE tenant_id=$1 LIMIT 1',
      [a.id],
    );
    const [policy] = await db.query(
      "INSERT INTO leave_policies(tenant_id,leave_type_id,name,effective_from,balance_controlled) VALUES($1,$2,'Notification test','2026-01-01',false) RETURNING id",
      [a.id, type.id],
    );
    await db.query(
      "INSERT INTO employee_leave_policies(tenant_id,employee_id,policy_id,effective_from) VALUES($1,$2,$3,'2026-01-01')",
      [a.id, staff.id, policy.id],
    );
    response = await as(staff, '/leave/requests', 'POST', {
      policy_id: policy.id,
      start_date: '2026-10-08',
      end_date: '2026-10-08',
      reason: 'PRIVATE LEAVE REASON',
    });
    expectStatus(response, 201);
    const leaveId = response.body.id;
    let managerInbox = (await as(boss, '/notifications')).body;
    assert.equal(
      managerInbox.items.filter((row) => row.type === 'leave.submitted').length,
      1,
    );
    assert.equal(
      (await as(other, '/notifications')).body.items.filter(
        (row) => row.type === 'leave.submitted',
      ).length,
      0,
    );
    expectStatus(
      await as(boss, `/leave/requests/${leaveId}/review`, 'POST', {
        decision: 'approved',
        comment: 'PRIVATE COMMENT',
      }),
      201,
    );
    const staffInbox = (await as(staff, '/notifications')).body;
    assert(staffInbox.items.some((row) => row.type === 'leave.approved'));
    assert(!JSON.stringify(staffInbox).includes('PRIVATE'));
    response = await as(staff, '/attendance/regularizations', 'POST', {
      work_date: '2026-10-06',
      check_in: '2026-10-06T09:00:00+05:30',
      check_out: '2026-10-06T18:00:00+05:30',
      reason: 'PRIVATE CORRECTION',
    });
    expectStatus(response, 201);
    expectStatus(
      await as(
        boss,
        `/attendance/regularizations/${response.body.id}/review`,
        'POST',
        { decision: 'rejected', comment: 'PRIVATE CORRECTION REVIEW' },
      ),
      201,
    );
    assert(
      (await as(staff, '/notifications')).body.items.some(
        (row) => row.type === 'attendance.rejected',
      ),
    );
    const before = (await jobs()).length;
    await tenants.withTenant(a.id, (manager) =>
      events.workflow(manager, a.id, 'leave', leaveId, staff.id, 'submitted'),
    );
    assert.equal((await jobs()).length, before);
    await assert.rejects(
      tenants.withTenant(a.id, async (manager) => {
        await events.payslip(manager, a.id, staff.id, randomUUID());
        throw new Error('ROLLBACK_FIXTURE');
      }),
      /ROLLBACK_FIXTURE/,
    );
    assert.equal((await jobs()).length, before);
    pass(
      'real leave/attendance workflows notify only authorized recipients; outbox is atomic, deduplicated and excludes reasons',
    );

    const leaveJob = await jobFor('leave', staffRow.user_id);
    fail = true;
    await assert.rejects(
      delivery.deliver(a.id, leaveJob.id),
      /NOTIFICATION_DELIVERY_RETRY/,
    );
    let stored = (await jobs()).find((job) => job.id === leaveJob.id);
    assert.equal(stored.attempts, 1);
    assert.equal(stored.last_error_code, 'SMTP_DELIVERY_FAILED');
    assert.equal(stored.delivery_status, 'pending');
    assert.equal(
      (
        await db.query('SELECT status FROM leave_requests WHERE id=$1', [
          leaveId,
        ])
      )[0].status,
      'approved',
    );
    for (let attempt = 2; attempt <= 5; attempt++) {
      await db.query(
        'UPDATE outbox_events SET available_at=now() WHERE id=$1',
        [leaveJob.id],
      );
      if (attempt < 5)
        await assert.rejects(delivery.deliver(a.id, leaveJob.id));
      else await delivery.deliver(a.id, leaveJob.id);
    }
    stored = (await jobs()).find((job) => job.id === leaveJob.id);
    assert.equal(stored.delivery_status, 'failed');
    assert.equal(stored.attempts, 5);
    assert(!JSON.stringify(stored).includes('private credentials'));
    expectStatus(
      await as(
        boss,
        `/notifications/deliveries/${leaveJob.id}/retry`,
        'POST',
        {},
      ),
      403,
    );
    expectStatus(
      await as(b, `/notifications/deliveries/${leaveJob.id}/retry`, 'POST', {}),
      404,
    );
    expectStatus(
      await req(`/notifications/deliveries/${leaveJob.id}/retry`, 'POST', {}),
      201,
    );
    fail = false;
    await delivery.deliver(a.id, leaveJob.id);
    await delivery.deliver(a.id, leaveJob.id);
    assert.equal(sent.length, 1);
    assert(!sent[0].text.includes('PRIVATE'));
    assert.equal(
      (await jobs()).find((job) => job.id === leaveJob.id).delivery_status,
      'sent',
    );
    assert.equal(
      (
        await db.query(
          "SELECT count(*)::int AS count FROM audit_logs WHERE tenant_id=$1 AND action='notification.delivery_retried'",
          [a.id],
        )
      )[0].count,
      1,
    );
    pass(
      'SMTP failure does not undo approvals, retries are bounded, completion is idempotent and manual retry is authorized/audited',
    );

    const [invited] = await db.query(
      "INSERT INTO users(tenant_id,email,display_name,status) VALUES($1,$2,'Email Test','invited') RETURNING id",
      [a.id, `notification-${database}@example.test`],
    );
    const issue = () =>
      tenants.withTenant(a.id, (manager) =>
        app.get(InvitationsService).issue(manager, a.id, invited.id),
      );
    const first = await issue();
    let invitationJob = (await jobs()).find(
      (job) => job.payload.recipient_id === invited.id,
    );
    assert(invitationJob.encrypted_secret);
    assert(!JSON.stringify(invitationJob).includes(first.token));
    assert.equal(
      secrets.open(invitationJob.encrypted_secret, a.id, invitationJob.id),
      first.token,
    );
    assert.throws(() =>
      secrets.open(invitationJob.encrypted_secret, b.id, invitationJob.id),
    );
    const latest = await issue();
    await delivery.deliver(a.id, invitationJob.id);
    assert.equal(
      (await jobs()).find((job) => job.id === invitationJob.id).delivery_status,
      'skipped',
    );
    assert.equal(sent.length, 1);
    const current = (await jobs()).find(
      (job) =>
        job.payload.recipient_id === invited.id && job.id !== invitationJob.id,
    );
    await delivery.deliver(b.id, current.id);
    assert.equal(sent.length, 1);
    await delivery.deliver(a.id, current.id);
    assert.equal(sent.length, 2);
    assert(sent[1].text.includes(encodeURIComponent(latest.token)));
    assert(sent[1].text.includes('/activate#'));
    assert.equal(
      (await jobs()).find((job) => job.id === current.id).encrypted_secret,
      null,
    );
    const managerJob = await jobFor('leave', bossRow.user_id);
    await db.query('UPDATE employees SET manager_id=NULL WHERE id=$1', [
      staff.id,
    ]);
    await delivery.deliver(a.id, managerJob.id);
    assert.equal(
      (await jobs()).find((job) => job.id === managerJob.id).last_error_code,
      'RECIPIENT_ACCESS_CHANGED',
    );
    const list = await req('/notifications/deliveries');
    expectStatus(list, 200);
    assert(!JSON.stringify(list.body).includes('encrypted_secret'));
    assert(!JSON.stringify(list.body).includes(latest.token));
    pass(
      'invitation secrets are encrypted and cleared, replaced links are skipped, and delivery rechecks current manager scope',
    );

    // Real Redis/BullMQ with an isolated prefix and a local SMTP sink only.
    process.env.REDIS_URL = 'redis://127.0.0.1:6380';
    process.env.NOTIFICATION_QUEUE_PREFIX = database;
    process.env.SMTP_HOST = '127.0.0.1';
    process.env.SMTP_PORT = '1025';
    process.env.SMTP_SECURE = 'false';
    process.env.SMTP_REQUIRE_TLS = 'false';
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    process.env.SMTP_FROM = 'Micro HRMS Tests <tests@microhrms.test>';
    const {
      SmtpEmailProvider,
    } = require('../dist/modules/notifications/email-provider');
    const {
      NotificationWorker,
    } = require('../dist/modules/notifications/notification-worker');
    const smtpDelivery = new NotificationDelivery(
      tenants,
      config,
      secrets,
      recipients,
      new SmtpEmailProvider(config),
    );
    await issue();
    const queued = (await jobs()).filter(
      (job) =>
        job.payload.recipient_id === invited.id &&
        job.delivery_status === 'pending',
    )[0];
    const runtime = app.get(DataSource);
    const candidates = await runtime
      .createQueryBuilder()
      .from('notification_dispatch_candidates', 'candidate')
      .select(['candidate.id AS id', 'candidate.tenant_id AS tenant_id'])
      .getRawMany();
    assert(candidates.some((row) => row.id === queued.id));
    assert(
      candidates.every(
        (row) => Object.keys(row).sort().join(',') === 'id,tenant_id',
      ),
    );
    const worker = new NotificationWorker(runtime, smtpDelivery);
    try {
      worker.onModuleInit();
      const deadline = Date.now() + 20000;
      do {
        stored = (await jobs()).find((job) => job.id === queued.id);
        if (stored.delivery_status === 'sent') break;
        await new Promise((resolve) => setTimeout(resolve, 200));
      } while (Date.now() < deadline);
      assert.equal(stored.delivery_status, 'sent');
      assert.equal(stored.encrypted_secret, null);
    } finally {
      await worker.onModuleDestroy();
    }
    const inbox = await (
      await fetch('http://127.0.0.1:8025/api/v1/messages')
    ).json();
    assert(
      inbox.messages.some((message) =>
        message.To?.some(
          (to) => to.Address === `notification-${database}@example.test`,
        ),
      ),
    );
    const { Queue } = require('bullmq');
    const cleanup = new Queue('notifications-email', {
      prefix: database,
      connection: { host: '127.0.0.1', port: 6380 },
    });
    try {
      await cleanup.obliterate({ force: true });
    } finally {
      await cleanup.close();
    }
    pass(
      'real BullMQ dispatcher/worker delivers through local SMTP to Mailpit and discovers only event references',
    );
    console.log(`Notification integration checks passed: ${checks}`);
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

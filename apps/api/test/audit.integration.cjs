/* Real HTTP/RLS checks in an isolated local database; no development rows changed. */
const assert = require('node:assert/strict');
const { randomBytes, randomUUID } = require('node:crypto');
const { DataSource } = require('typeorm');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { databaseOptions } = require('../dist/database/database.options');
const { hashPassword } = require('../dist/modules/auth/password');

async function main() {
  const migration = databaseOptions(true),
    runtime = databaseOptions();
  const url = new URL(migration.url);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  const name = `microhrms_audit_test_${randomBytes(8).toString('hex')}`;
  const admin = new DataSource(migration);
  let db,
    app,
    created = false,
    checks = 0;
  const pass = (message) => {
    checks++;
    console.log(`PASS ${message}`);
  };
  try {
    await admin.initialize();
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    url.pathname = `/${name}`;
    db = await new DataSource({
      ...migration,
      url: url.toString(),
    }).initialize();
    await db.runMigrations();
    const runtimeUrl = new URL(runtime.url);
    runtimeUrl.pathname = `/${name}`;
    process.env.DATABASE_URL = runtimeUrl.toString();
    process.env.EMAIL_DRIVER = 'disabled';
    process.env.AUTH_ORIGINS = 'http://localhost:4200';
    const password = 'Audit integration password 123!';
    const passwordHash = await hashPassword(password);
    await db.query(
      'INSERT INTO platform_admins(email,password_hash,must_change_password) VALUES ($1,$2,false)',
      ['audit-platform@example.test', passwordHash],
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
    async function request(path, cookie, method = 'GET', body) {
      const response = await fetch(base + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-HRMS-Request': '1',
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
        cache: response.headers.get('cache-control'),
      };
    }
    const platform = await request('/auth/login', null, 'POST', {
      kind: 'platform',
      email: 'audit-platform@example.test',
      password,
    });
    assert.equal(platform.status, 200);
    async function company(slug) {
      const result = await request(
        '/platform/companies',
        platform.cookie,
        'POST',
        {
          name: slug,
          slug,
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          date_format: 'dd/MM/yyyy',
          contact_email: 'contact@example.test',
          address: {},
          admin_name: 'Audit Admin',
          admin_email: 'admin@example.test',
        },
      );
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(
        (
          await request('/auth/activate', null, 'POST', {
            token: result.body.invitation.token,
            password,
          })
        ).status,
        200,
      );
      const login = await request('/auth/login', null, 'POST', {
        kind: 'tenant',
        company: slug,
        email: 'admin@example.test',
        password,
      });
      assert.equal(login.status, 200);
      const [user] = await db.query(
        'SELECT id FROM users WHERE tenant_id=$1 AND email=$2',
        [result.body.company.id, 'admin@example.test'],
      );
      return {
        id: result.body.company.id,
        userId: user.id,
        cookie: login.cookie,
      };
    }
    const a = await company('audit-a'),
      b = await company('audit-b');
    const req = (path) => request(path, a.cookie);
    for (const path of [
      '/audit-logs',
      '/audit-logs/options',
      `/audit-logs/${randomUUID()}`,
    ]) {
      assert.equal((await request(path)).status, 401);
      assert.equal((await request(path, platform.cookie)).status, 403);
    }
    const staffId = randomUUID();
    await db.query(
      "INSERT INTO users(id,tenant_id,email,display_name,password_hash,status) VALUES ($1,$2,'staff@example.test','Audit Staff',$3,'active')",
      [staffId, a.id, passwordHash],
    );
    const staff = await request('/auth/login', null, 'POST', {
      kind: 'tenant',
      company: 'audit-a',
      email: 'staff@example.test',
      password,
    });
    assert.equal(staff.status, 200);
    for (const path of [
      '/audit-logs',
      '/audit-logs/options',
      `/audit-logs/${randomUUID()}`,
    ])
      assert.equal((await request(path, staff.cookie)).status, 403);
    pass(
      'anonymous, platform and unprivileged tenant accounts cannot read audit endpoints',
    );

    // Deliberate canaries prove stored snapshots are not serialized by the read API.
    const entity = randomUUID();
    async function event(
      tenant,
      action,
      when,
      actorId = tenant.userId,
      metadata = {},
    ) {
      const id = randomUUID();
      await db.query(
        'INSERT INTO audit_logs(id,tenant_id,actor_id,action,entity_type,entity_id,metadata,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
        [id, tenant.id, actorId, action, 'employee', entity, metadata, when],
      );
      return id;
    }
    const sensitive = {
      count: 2,
      employee_id: entity,
      password: 'SECRET_PASSWORD_CANARY',
      token: 'SECRET_TOKEN_CANARY',
      reason: 'PRIVATE_REASON_CANARY',
      before: { bank_account: 'BANK_CANARY', salary: 'SALARY_CANARY' },
      after: { password_hash: 'HASH_CANARY' },
      ignored_future_field: 'UNKNOWN_CANARY',
    };
    const first = await event(
      a,
      'employee.updated',
      '2025-03-01T00:00:00.000Z',
      a.userId,
      sensitive,
    );
    const last = await event(
      a,
      'employee.updated',
      '2025-03-01T23:59:59.999Z',
      staffId,
    );
    await event(a, 'employee.updated', '2025-03-02T00:00:00.000Z');
    const system = await event(
      a,
      'payroll.locked',
      '2025-03-01T12:00:00.000Z',
      null,
    );
    const foreign = await event(
      b,
      'foreign.secret_action',
      '2025-03-01T12:00:00.000Z',
    );
    const list = await req('/audit-logs?from=2025-03-01&to=2025-03-01');
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.cache, 'no-store');
    assert.equal(list.body.total, 3);
    assert.deepEqual(
      list.body.items.map((row) => row.id),
      [last, system, first],
    );
    assert.ok(
      list.body.items.every(
        (row) => !('metadata' in row) && !('request_id' in row),
      ),
    );
    const detail = await req(`/audit-logs/${first}`);
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.details, { count: 2, employee_id: entity });
    assert.equal(detail.body.actor_name, 'Audit Admin');
    for (const response of [list, detail])
      assert.ok(!JSON.stringify(response.body).includes('CANARY'));
    assert.equal((await req(`/audit-logs/${foreign}`)).status, 404);
    assert.equal((await request(`/audit-logs/${first}`, b.cookie)).status, 404);
    assert.equal((await req(`/audit-logs/${randomUUID()}`)).status, 404);
    assert.equal((await req(`/audit-logs/${system}`)).body.actor_id, null);
    pass(
      'inclusive UTC dates, newest-first sorting, event details and confidential metadata protection',
    );

    const options = await req('/audit-logs/options');
    assert.equal(options.status, 200);
    assert.ok(options.body.actions.includes('employee.updated'));
    assert.ok(!options.body.actions.includes('foreign.secret_action'));
    assert.ok(!options.body.modules.includes('foreign'));
    const filtered = await req(
      '/audit-logs?module=employee&action=employee.updated&actor=aUdIt%20sTaFf&from=2025-03-01&to=2025-03-01',
    );
    assert.deepEqual(
      filtered.body.items.map((row) => row.id),
      [last],
    );
    assert.equal((await req(`/audit-logs?actor_id=${b.userId}`)).body.total, 0);
    assert.equal((await req('/audit-logs?actor=%25')).body.total, 0);
    assert.equal(
      (
        await req(
          `/audit-logs?entity_id=${entity}&from=2025-03-01&to=2025-03-01`,
        )
      ).body.total,
      3,
    );
    const page1 = await req(
      '/audit-logs?from=2025-03-01&to=2025-03-01&limit=1&page=1',
    );
    const page2 = await req(
      '/audit-logs?from=2025-03-01&to=2025-03-01&limit=1&page=2',
    );
    assert.equal(page1.body.total, 3);
    assert.equal(page2.body.total, 3);
    assert.notEqual(page1.body.items[0].id, page2.body.items[0].id);
    assert.equal(
      (await req('/audit-logs?from=2025-03-01&to=2025-03-01&page=99')).body
        .items.length,
      0,
    );
    pass(
      'tenant-scoped options, user/module/action/resource filters and stable pagination',
    );
    for (const query of [
      'page=0',
      'page=100001',
      'limit=101',
      'page=1.5',
      'actor_id=bad',
      'entity_id=bad',
      'from=2025-02-30',
      'from=2025-03-02&to=2025-03-01',
      'from=2025-03-01T00:00:00Z',
      'tenant_id=' + b.id,
      'module=x%27',
      'action=x%27',
    ])
      assert.equal((await req('/audit-logs?' + query)).status, 400, query);
    assert.equal((await req('/audit-logs/not-a-uuid')).status, 400);
    for (const method of ['POST', 'PUT', 'DELETE'])
      assert.equal(
        (await request(`/audit-logs/${first}`, a.cookie, method, {})).status,
        404,
      );
    pass(
      'invalid filters and forged tenant fields rejected; no audit mutation API',
    );
    await db.query(
      "UPDATE users SET display_name='Renamed Admin',status='disabled' WHERE id=$1",
      [staffId],
    );
    const archived = await req(`/audit-logs/${last}`);
    assert.equal(archived.body.actor_name, 'Renamed Admin');
    assert.equal(archived.body.actor_id, staffId);
    const [before] = await db.query(
      'SELECT count(*)::int AS count FROM audit_logs WHERE tenant_id=$1',
      [a.id],
    );
    await req('/audit-logs');
    await req(`/audit-logs/${first}`);
    const [after] = await db.query(
      'SELECT count(*)::int AS count FROM audit_logs WHERE tenant_id=$1',
      [a.id],
    );
    assert.equal(after.count, before.count);
    await db.query(
      "DELETE FROM role_permissions WHERE tenant_id=$1 AND permission_code='company.manage'",
      [a.id],
    );
    for (const path of [
      '/audit-logs',
      '/audit-logs/options',
      `/audit-logs/${first}`,
    ])
      assert.equal((await req(path)).status, 403);
    pass(
      'disabled actor identity remains attributable, reads do not write audit events, permission revocation takes effect immediately',
    );
    console.log(`Audit integration checks passed: ${checks}`);
  } finally {
    if (app) await app.close();
    if (db?.isInitialized) await db.destroy();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    if (admin.isInitialized) await admin.destroy();
  }
}
main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

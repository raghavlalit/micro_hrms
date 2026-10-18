/* Real HTTP/RLS checks in an isolated local database; no development rows changed. */
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
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
  const name = `microhrms_recovery_test_${randomBytes(8).toString('hex')}`;
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
    process.env.EMAIL_DRIVER = 'smtp';
    process.env.NOTIFICATION_DATA_KEYS = JSON.stringify({
      v1: randomBytes(32).toString('base64'),
    });
    process.env.NOTIFICATION_KEY_VERSION = 'v1';
    process.env.WEB_ORIGIN = 'http://localhost:4200';
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
    const a = await company('recovery-a'),
      b = await company('recovery-b');
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
      SmtpEmailProvider,
    } = require('../dist/modules/notifications/email-provider');
    const {
      credentialHash,
      verifyPassword,
    } = require('../dist/modules/auth/password');
    const config = app.get(NotificationConfig),
      secrets = app.get(NotificationSecret),
      sent = [];
    const delivery = new NotificationDelivery(
      app.get(TenantDatabaseService),
      config,
      secrets,
      app.get(NotificationRecipients),
      {
        send: async (message) => {
          sent.push(message);
        },
      },
    );
    const forgot = (
      company = 'recovery-a',
      email = 'admin@example.test',
      extra = {},
    ) =>
      request('/auth/forgot-password', null, 'POST', {
        company,
        email,
        ...extra,
      });
    const newPassword = 'Recovered company password 456!';
    const reset = (token, value = newPassword) =>
      request('/auth/reset-password', null, 'POST', { token, password: value });
    const login = (company, value) =>
      request('/auth/login', null, 'POST', {
        kind: 'tenant',
        company,
        email: 'admin@example.test',
        password: value,
      });
    const clearLimits = () => db.query('DELETE FROM auth_rate_limits');
    async function latest(tenant = a) {
      const [row] = await db.query(
        "SELECT * FROM outbox_events WHERE tenant_id=$1 AND payload->>'kind'='password_reset' ORDER BY created_at DESC,id DESC LIMIT 1",
        [tenant.id],
      );
      assert.ok(row, 'Reset outbox row expected');
      return {
        ...row,
        token: row.encrypted_secret
          ? secrets.open(row.encrypted_secret, tenant.id, row.id)
          : null,
      };
    }
    const accepted = await forgot(' RECOVERY-A ', ' ADMIN@example.test ');
    assert.equal(accepted.status, 200);
    assert.equal(accepted.cache, 'no-store');
    assert.deepEqual(Object.keys(accepted.body), ['message']);
    const first = await latest();
    assert.ok(first.token.startsWith(a.id + '.r.'));
    assert.ok(!JSON.stringify(first.payload).includes(first.token));
    const [tokenRow] = await db.query('SELECT * FROM auth_tokens WHERE id=$1', [
      first.payload.auth_token_id,
    ]);
    assert.equal(tokenRow.token_hash, credentialHash(first.token));
    assert.ok(tokenRow.expires_at - tokenRow.created_at >= 29 * 60000);
    assert.ok(tokenRow.expires_at - tokenRow.created_at <= 31 * 60000);
    assert.equal((await request('/auth/me', a.cookie)).status, 200);
    const unavailable = [
      await forgot('missing-company'),
      await forgot('recovery-a', 'missing@example.test'),
      await forgot('recovery-a', 'audit-platform@example.test'),
    ];
    for (const status of ['invited', 'disabled']) {
      await db.query('UPDATE users SET status=$1 WHERE id=$2', [
        status,
        a.userId,
      ]);
      unavailable.push(await forgot());
    }
    await db.query("UPDATE users SET status='active' WHERE id=$1", [a.userId]);
    await db.query("UPDATE tenants SET status='suspended' WHERE id=$1", [b.id]);
    unavailable.push(await forgot('recovery-b'));
    await db.query("UPDATE tenants SET status='trial' WHERE id=$1", [b.id]);
    for (const result of unavailable) {
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, accepted.body);
    }
    assert.equal((await latest()).id, first.id);
    const csrf = await fetch(base + '/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: 'recovery-a',
        email: 'admin@example.test',
      }),
    });
    assert.equal(csrf.status, 403);
    assert.equal(
      (await forgot('recovery-a', 'admin@example.test', { tenant_id: b.id }))
        .status,
      400,
    );
    assert.equal(
      (await forgot('recovery-a', 'admin@example.test', { kind: 'platform' }))
        .status,
      400,
    );
    pass(
      'generic request responses, eligible accounts only, normalization, CSRF and encrypted 30-minute reset tokens',
    );

    await clearLimits();
    assert.equal((await forgot()).status, 200);
    const second = await latest();
    assert.notEqual(first.token, second.token);
    await delivery.deliver(a.id, first.id);
    assert.equal(sent.length, 0);
    assert.equal((await reset(first.token)).status, 401);
    assert.equal((await reset(second.token.replace(a.id, b.id))).status, 401);
    await delivery.deliver(a.id, second.id);
    assert.equal(sent.length, 1);
    assert.ok(sent[0].text.includes('/reset-password#' + second.token));
    assert.ok(!sent[0].text.includes('?token='));
    assert.ok(sent[0].text.includes('30 minutes'));
    const [sentRow] = await db.query(
      'SELECT encrypted_secret,delivery_status FROM outbox_events WHERE id=$1',
      [second.id],
    );
    assert.equal(sentRow.encrypted_secret, null);
    assert.equal(sentRow.delivery_status, 'sent');
    assert.equal((await reset(second.token, 'short')).status, 400);
    const extraSession = await login('recovery-a', password);
    const attempts = await Promise.all([
      reset(second.token),
      reset(second.token),
    ]);
    assert.deepEqual(
      attempts.map((row) => row.status).sort((a, b) => a - b),
      [200, 401],
    );
    assert.equal((await request('/auth/me', a.cookie)).status, 401);
    assert.equal((await request('/auth/me', extraSession.cookie)).status, 401);
    assert.equal((await request('/auth/me', b.cookie)).status, 200);
    assert.equal((await request('/auth/me', platform.cookie)).status, 200);
    assert.equal((await login('recovery-a', password)).status, 401);
    const recovered = await login('recovery-a', newPassword);
    assert.equal(recovered.status, 200);
    assert.equal((await login('recovery-b', password)).status, 200);
    const [identity] = await db.query(
      'SELECT password_hash FROM users WHERE id=$1',
      [a.userId],
    );
    assert.ok(await verifyPassword(newPassword, identity.password_hash));
    assert.notEqual(identity.password_hash, newPassword);
    const audits = await db.query(
      "SELECT * FROM audit_logs WHERE tenant_id=$1 AND action='user.password_reset'",
      [a.id],
    );
    assert.equal(audits.length, 1);
    assert.equal(audits[0].actor_id, a.userId);
    assert.ok(!JSON.stringify(audits).includes(second.token));
    assert.ok(!JSON.stringify(audits).includes(newPassword));
    pass(
      'replacement and cross-tenant tokens rejected, encrypted email link delivered, concurrent reset succeeds once and revokes only that account sessions',
    );

    await clearLimits();
    await forgot();
    const expired = await latest();
    await db.query(
      "UPDATE auth_tokens SET expires_at=now()-interval '1 second' WHERE id=$1",
      [expired.payload.auth_token_id],
    );
    assert.equal((await reset(expired.token)).status, 401);
    await delivery.deliver(a.id, expired.id);
    assert.equal(sent.length, 1);
    await forgot();
    const wrongPurpose = await latest();
    await db.query("UPDATE auth_tokens SET purpose='invitation' WHERE id=$1", [
      wrongPurpose.payload.auth_token_id,
    ]);
    assert.equal((await reset(wrongPurpose.token)).status, 401);
    await forgot();
    const disabled = await latest();
    await db.query("UPDATE users SET status='disabled' WHERE id=$1", [
      a.userId,
    ]);
    assert.equal((await reset(disabled.token)).status, 401);
    await delivery.deliver(a.id, disabled.id);
    assert.equal(sent.length, 1);
    await db.query("UPDATE users SET status='active' WHERE id=$1", [a.userId]);
    await db.query("UPDATE tenants SET status='suspended' WHERE id=$1", [a.id]);
    assert.equal((await reset(disabled.token)).status, 401);
    await db.query("UPDATE tenants SET status='trial' WHERE id=$1", [a.id]);
    await forgot();
    const beforeChange = await latest();
    const changedPassword = 'Changed while reset pending 789!';
    assert.equal(
      (
        await request('/auth/password', recovered.cookie, 'POST', {
          currentPassword: newPassword,
          newPassword: changedPassword,
        })
      ).status,
      200,
    );
    assert.equal((await reset(beforeChange.token)).status, 401);
    assert.equal((await login('recovery-a', changedPassword)).status, 200);
    pass(
      'expiry, token purpose, disabled/suspended accounts and normal password changes invalidate recovery attempts',
    );

    await clearLimits();
    await forgot();
    const beforeFailure = await latest();
    const producer = app.get(NotificationEvents),
      original = producer.passwordReset.bind(producer);
    producer.passwordReset = async () => {
      throw new Error('Synthetic outbox failure');
    };
    try {
      assert.equal((await forgot()).status, 500);
    } finally {
      producer.passwordReset = original;
    }
    assert.equal((await latest()).id, beforeFailure.id);
    const [stillValid] = await db.query(
      'SELECT consumed_at FROM auth_tokens WHERE id=$1',
      [beforeFailure.payload.auth_token_id],
    );
    assert.equal(stillValid.consumed_at, null);
    const beforeDisabled = config.driver;
    config.driver = 'disabled';
    try {
      assert.deepEqual((await forgot()).body, accepted.body);
    } finally {
      config.driver = beforeDisabled;
    }
    assert.equal((await latest()).id, beforeFailure.id);
    const failedDelivery = new NotificationDelivery(
      app.get(TenantDatabaseService),
      config,
      secrets,
      app.get(NotificationRecipients),
      {
        send: async () => {
          throw new Error('SMTP_SECRET_CANARY');
        },
      },
    );
    for (let attempt = 0; attempt < 5; attempt++) {
      await db.query(
        'UPDATE outbox_events SET available_at=now() WHERE id=$1',
        [beforeFailure.id],
      );
      try {
        await failedDelivery.deliver(a.id, beforeFailure.id);
      } catch (error) {
        assert.equal(error.message, 'NOTIFICATION_DELIVERY_RETRY');
      }
    }
    const [failed] = await db.query('SELECT * FROM outbox_events WHERE id=$1', [
      beforeFailure.id,
    ]);
    assert.equal(failed.delivery_status, 'failed');
    assert.equal(failed.encrypted_secret, null);
    assert.ok(!JSON.stringify(failed).includes('SMTP_SECRET_CANARY'));
    const owner = await login('recovery-a', changedPassword);
    const retry = await request(
      `/notifications/deliveries/${beforeFailure.id}/retry`,
      owner.cookie,
      'POST',
      {},
    );
    assert.equal(retry.status, 409);
    assert.ok(retry.body.message.includes('new password reset'));
    pass(
      'issuance rollback preserves prior link, disabled email issues nothing, SMTP failure clears secret and cannot be manually retried',
    );

    await clearLimits();
    for (let i = 0; i < 5; i++)
      assert.equal(
        (await forgot('missing-company', 'rate@example.test')).status,
        200,
      );
    assert.equal(
      (await forgot('missing-company', 'rate@example.test')).status,
      429,
    );
    await clearLimits();
    await db.query(
      "INSERT INTO auth_rate_limits(key,attempts,expires_at) VALUES ($1,30,now()+interval '15 minutes')",
      [credentialHash('reset-request-ip:127.0.0.1')],
    );
    assert.equal(
      (await forgot('missing-company', 'ip@example.test')).status,
      429,
    );
    await clearLimits();
    const bogus = a.id + '.r.' + 'a'.repeat(64);
    for (let i = 0; i < 10; i++) assert.equal((await reset(bogus)).status, 401);
    assert.equal((await reset(bogus)).status, 429);
    assert.equal((await reset('bad')).status, 400);
    pass(
      'request identity/IP and token-consumption rate limits protect public recovery endpoints',
    );

    // Verify the actual SMTP adapter against local Mailpit, never an external provider.
    await clearLimits();
    const mailbox = `recovery-${name}@example.test`;
    await db.query('UPDATE users SET email=$1 WHERE id=$2', [
      mailbox,
      a.userId,
    ]);
    assert.equal((await forgot('recovery-a', mailbox)).status, 200);
    const localEmail = await latest();
    Object.assign(process.env, {
      SMTP_HOST: '127.0.0.1',
      SMTP_PORT: '1025',
      SMTP_SECURE: 'false',
      SMTP_REQUIRE_TLS: 'false',
      SMTP_FROM: 'Micro HRMS <no-reply@microhrms.test>',
    });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    const smtp = new NotificationDelivery(
      app.get(TenantDatabaseService),
      config,
      secrets,
      app.get(NotificationRecipients),
      new SmtpEmailProvider(config),
    );
    await smtp.deliver(a.id, localEmail.id);
    const inbox = await (
      await fetch('http://127.0.0.1:8025/api/v1/messages')
    ).json();
    const message = inbox.messages.find((message) =>
      message.To?.some((to) => to.Address === mailbox),
    );
    assert.ok(message);
    const captured = await (
      await fetch(`http://127.0.0.1:8025/api/v1/message/${message.ID}`)
    ).json();
    assert.ok(captured.Text.includes('/reset-password#' + localEmail.token));
    assert.equal((await reset(localEmail.token)).status, 200);
    pass(
      'real local Mailpit email contains a working fragment-based recovery link',
    );
    console.log(`Password recovery integration checks passed: ${checks}`);
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

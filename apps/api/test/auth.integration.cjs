/* Isolated HTTP + PostgreSQL tests. Drops only its randomly named local database. */
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { DataSource } = require('typeorm');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { databaseOptions } = require('../dist/database/database.options');
const {
  hashPassword,
  credentialHash,
} = require('../dist/modules/auth/password');

async function main() {
  const migrationOptions = databaseOptions(true);
  const runtimeOptions = databaseOptions();
  const url = new URL(migrationOptions.url);
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    throw new Error('Tests require local PostgreSQL');
  const database = `microhrms_auth_test_${randomBytes(8).toString('hex')}`;
  const admin = new DataSource(migrationOptions);
  let db,
    app,
    created = false,
    checks = 0;
  function pass(name) {
    checks++;
    console.log(`PASS ${name}`);
  }
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
    const password = 'Test initial password 123!';
    const nextPassword = 'Different test password 456!';
    const hash = await hashPassword(password);
    const [platform] = await db.query(
      'INSERT INTO platform_admins (email,password_hash) VALUES ($1,$2) RETURNING id',
      ['admin@example.test', hash],
    );
    const [a] = await db.query(
      "INSERT INTO tenants (name,slug) VALUES ('Company A','company-a') RETURNING id",
    );
    const [b] = await db.query(
      "INSERT INTO tenants (name,slug) VALUES ('Company B','company-b') RETURNING id",
    );
    const [userA] = await db.query(
      "INSERT INTO users (tenant_id,email,display_name,password_hash,status) VALUES ($1,'employee@example.test','User A',$2,'active') RETURNING id",
      [a.id, hash],
    );
    const [userB] = await db.query(
      "INSERT INTO users (tenant_id,email,display_name,password_hash,status) VALUES ($1,'employee@example.test','User B',$2,'active') RETURNING id",
      [b.id, hash],
    );
    const [role] = await db.query(
      "INSERT INTO roles (tenant_id,code,name) VALUES ($1,'admin','Admin') RETURNING id",
      [a.id],
    );
    await db.query(
      'INSERT INTO user_roles (tenant_id,user_id,role_id) VALUES ($1,$2,$3)',
      [a.id, userA.id, role.id],
    );
    await db.query(
      "INSERT INTO role_permissions (tenant_id,role_id,permission_code) VALUES ($1,$2,'company.manage')",
      [a.id, role.id],
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
    async function request(path, body, cookie, headers = {}) {
      const response = await fetch(base + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: {
          ...(body === undefined
            ? {}
            : { 'Content-Type': 'application/json', 'X-HRMS-Request': '1' }),
          ...(cookie ? { Cookie: cookie } : {}),
          ...headers,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        body: await response.json(),
        cookie: response.headers.get('set-cookie')?.split(';')[0],
        header: response.headers.get('set-cookie'),
      };
    }
    const platformLogin = (pw = password) =>
      request('/auth/login', {
        kind: 'platform',
        email: 'admin@example.test',
        password: pw,
      });
    const tenantLogin = (company) =>
      request('/auth/login', {
        kind: 'tenant',
        company,
        email: 'employee@example.test',
        password,
      });
    assert.equal((await request('/auth/me')).status, 401);
    pass('anonymous requests rejected');
    assert.equal(
      (
        await request(
          '/auth/login',
          { kind: 'platform', email: 'admin@example.test', password },
          null,
          { 'X-HRMS-Request': '' },
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/auth/login',
          { kind: 'platform', email: 'admin@example.test', password },
          null,
          { Origin: 'https://evil.example' },
        )
      ).status,
      403,
    );
    pass('CSRF header and origin enforced');
    assert.equal(
      (
        await request('/auth/login', {
          kind: 'platform',
          email: 'admin@example.test',
          password,
          admin: true,
        })
      ).status,
      400,
    );
    pass('extra privilege fields rejected');
    const bad = await platformLogin('incorrect');
    const missing = await request('/auth/login', {
      kind: 'platform',
      email: 'missing@example.test',
      password: 'incorrect',
    });
    assert.equal(bad.status, 401);
    assert.deepEqual(bad.body, missing.body);
    pass('invalid and unknown credentials return identical errors');
    let session = await platformLogin();
    assert.equal(session.status, 200);
    assert.equal(session.body.user.mustChangePassword, true);
    assert.match(session.header, /HttpOnly/);
    assert.match(session.header, /SameSite=Strict/);
    assert.equal(session.body.user.password_hash, undefined);
    assert.equal(session.body.token, undefined);
    const [stored] = await db.query(
      'SELECT credential_hash FROM platform_sessions WHERE platform_admin_id=$1',
      [platform.id],
    );
    assert.equal(
      stored.credential_hash,
      credentialHash(session.cookie.split('=')[1]),
    );
    pass('login uses HttpOnly cookie and stores only token hash');
    assert.equal(
      (await request('/platform/overview', undefined, session.cookie)).status,
      403,
    );
    pass('temporary password blocks platform actions');
    const otherSession = await platformLogin();
    assert.equal(
      (
        await request(
          '/auth/password',
          { currentPassword: 'wrong', newPassword: nextPassword },
          session.cookie,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/auth/password',
          { currentPassword: password, newPassword: 'short' },
          session.cookie,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/auth/password',
          { currentPassword: password, newPassword: nextPassword },
          session.cookie,
        )
      ).status,
      200,
    );
    assert.equal(
      (await request('/auth/me', undefined, session.cookie)).status,
      401,
    );
    assert.equal(
      (await request('/auth/me', undefined, otherSession.cookie)).status,
      401,
    );
    assert.equal((await platformLogin()).status, 401);
    pass('password validation and change revoke all sessions and old password');
    session = await platformLogin(nextPassword);
    assert.equal(session.status, 200);
    assert.equal(
      (await request('/platform/overview', undefined, session.cookie)).status,
      200,
    );
    assert.equal(
      (await request('/company/access', undefined, session.cookie)).status,
      403,
    );
    pass('platform identity cannot enter tenant area');
    await db.query('UPDATE platform_admins SET disabled_at=now() WHERE id=$1', [
      platform.id,
    ]);
    assert.equal(
      (await request('/auth/me', undefined, session.cookie)).status,
      401,
    );
    await db.query('UPDATE platform_admins SET disabled_at=NULL WHERE id=$1', [
      platform.id,
    ]);
    pass('disabled platform administrator loses access');
    const sa = await tenantLogin('company-a');
    const sb = await tenantLogin('company-b');
    assert.equal(sa.status, 200);
    assert.equal(sb.status, 200);
    assert.equal(sa.body.user.id, userA.id);
    assert.equal(sb.body.user.id, userB.id);
    pass('same email resolves independently in each company');
    assert.equal(
      (await request('/platform/overview', undefined, sa.cookie)).status,
      403,
    );
    const access = await request('/company/access', undefined, sa.cookie, {
      'X-Tenant-ID': b.id,
    });
    assert.equal(access.status, 200);
    assert.equal(access.body.tenantId, a.id);
    assert.equal(
      (await request('/company/access', undefined, sb.cookie)).status,
      403,
    );
    pass('tenant header cannot override identity; permissions enforced');
    assert.equal(
      (await request('/auth/me', undefined, sa.cookie.replace(a.id, b.id)))
        .status,
      401,
    );
    pass('tampering with tenant ID invalidates session');
    await db.query('DELETE FROM role_permissions WHERE tenant_id=$1', [a.id]);
    assert.equal(
      (await request('/company/access', undefined, sa.cookie)).status,
      403,
    );
    pass('permission revocation takes effect immediately');
    await db.query("UPDATE tenants SET status='suspended' WHERE id=$1", [a.id]);
    assert.equal((await request('/auth/me', undefined, sa.cookie)).status, 403);
    pass('suspended tenant loses access');
    await db.query('UPDATE tenants SET archived_at=now() WHERE id=$1', [b.id]);
    assert.equal((await request('/auth/me', undefined, sb.cookie)).status, 403);
    await db.query('UPDATE tenants SET archived_at=NULL WHERE id=$1', [b.id]);
    pass('archived tenant loses access');
    await db.query("UPDATE users SET status='disabled' WHERE id=$1", [
      userB.id,
    ]);
    assert.equal((await request('/auth/me', undefined, sb.cookie)).status, 401);
    pass('disabled users lose access');
    await db.query(
      "UPDATE platform_sessions SET expires_at=now()-interval '1 second' WHERE platform_admin_id=$1",
      [platform.id],
    );
    assert.equal(
      (await request('/auth/me', undefined, session.cookie)).status,
      401,
    );
    pass('expired sessions rejected');
    session = await platformLogin(nextPassword);
    assert.equal(
      (await request('/auth/logout', {}, session.cookie)).status,
      200,
    );
    assert.equal(
      (await request('/auth/me', undefined, session.cookie)).status,
      401,
    );
    pass('logout revokes session');
    session = await platformLogin(nextPassword);
    const extra = await platformLogin(nextPassword);
    assert.equal(
      (await request('/auth/logout-all', {}, session.cookie)).status,
      200,
    );
    assert.equal(
      (await request('/auth/me', undefined, extra.cookie)).status,
      401,
    );
    pass('logout-all revokes other devices');
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await request('/auth/login', {
            kind: 'platform',
            email: 'rate@example.test',
            password: 'incorrect',
          })
        ).status,
        401,
      );
    assert.equal(
      (
        await request('/auth/login', {
          kind: 'platform',
          email: 'rate@example.test',
          password: 'incorrect',
        })
      ).status,
      429,
    );
    pass('persistent account rate limiting');
    const { AuthRepository } = require('../dist/modules/auth/auth.repository');
    const repository = app.get(AuthRepository);
    const counts = await Promise.all(
      Array.from({ length: 25 }, () =>
        repository.incrementAttempts('concurrent-test'),
      ),
    );
    assert.deepEqual(
      counts.sort((a, b) => a - b),
      Array.from({ length: 25 }, (_, i) => i + 1),
    );
    pass('concurrent rate-limit increments are atomic');
    await db.query(
      "UPDATE auth_rate_limits SET expires_at=now()-interval '1 second' WHERE key='concurrent-test'",
    );
    assert.equal(await repository.incrementAttempts('concurrent-test'), 1);
    pass('expired rate-limit window resets atomically');

    const { execFileSync } = require('node:child_process');
    const { resolve } = require('node:path');
    const command = resolve(
      __dirname,
      '../dist/modules/platform/commands/provision-platform-admin.js',
    );
    const provisionEnv = {
      ...process.env,
      MIGRATION_DATABASE_URL: url.toString(),
      PLATFORM_ADMIN_EMAIL: 'provision@example.test',
      PLATFORM_ADMIN_PASSWORD: password,
    };
    execFileSync(process.execPath, [command], {
      env: provisionEnv,
      stdio: 'pipe',
    });
    const [provisioned] = await db.query(
      "SELECT password_hash,must_change_password FROM platform_admins WHERE email='provision@example.test'",
    );
    assert.equal(provisioned.must_change_password, true);
    execFileSync(process.execPath, [command], {
      env: { ...provisionEnv, PLATFORM_ADMIN_PASSWORD: nextPassword },
      stdio: 'pipe',
    });
    const repeated = await db.query(
      "SELECT password_hash FROM platform_admins WHERE email='provision@example.test'",
    );
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].password_hash, provisioned.password_hash);
    pass(
      'module provisioning command creates once and preserves an existing password',
    );
    const runtime = app.get(DataSource);
    assert.equal((await runtime.query('SELECT * FROM users')).length, 0);
    pass('tenant context does not leak through connection pool');
    await assert.rejects(() =>
      runtime.query(
        "INSERT INTO platform_admins(email,password_hash) VALUES ('bad@example.test','bad')",
      ),
    );
    pass('runtime cannot provision platform admins');
    console.log(`Authentication integration checks passed: ${checks}`);
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

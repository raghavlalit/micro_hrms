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
  const database = `microhrms_documents_test_${randomBytes(8).toString('hex')}`;
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
    process.env.DOCUMENT_STORAGE_DRIVER = 'local';
    process.env.DOCUMENT_STORAGE_DIR = require('node:path').resolve(
      '.tmp/document-test-files',
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
    const a = await company('documents-a'),
      b = await company('documents-b');
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
        first_name: 'Document',
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
          await login('documents-a', code.toLowerCase() + '@example.test')
        ).cookie,
      };
    }
    const boss = await employee('BOSS', null, 'manager'),
      staff = await employee('STAFF', boss.id),
      other = await employee('OTHER');
    const { randomUUID } = require('node:crypto');
    // Simulate upgrading an existing company whose admin predates the new permission.
    await db.query(
      "DELETE FROM role_permissions WHERE tenant_id=$1 AND permission_code='documents.read.team'",
      [a.id],
    );
    const {
      DocumentManagementGrants1791440000001,
    } = require('../dist/database/migrations/1791440000001-DocumentManagementGrants');
    const grantRunner = db.createQueryRunner();
    try {
      const upgrade = new DocumentManagementGrants1791440000001();
      await upgrade.up(grantRunner);
      await upgrade.up(grantRunner);
    } finally {
      await grantRunner.release();
    }
    const upgraded = await db.query(
      "SELECT r.code FROM roles r JOIN role_permissions p ON p.role_id=r.id AND p.tenant_id=r.tenant_id WHERE r.tenant_id=$1 AND p.permission_code='documents.read.team' ORDER BY r.code",
      [a.id],
    );
    assert.deepEqual(
      upgraded.map((row) => row.code),
      ['company_admin', 'hr'],
    );
    assert.equal(
      (
        await db.query(
          "SELECT id FROM audit_logs WHERE tenant_id=$1 AND action='role.document_team_permission_added'",
          [a.id],
        )
      ).length,
      2,
    );
    expectStatus(
      await req('/roles', 'POST', {
        code: 'document_team_reader',
        name: 'Document team reader',
        permission_codes: ['documents.read.team'],
        reason: 'Explicit document access delegation',
      }),
      201,
    );
    pass(
      'upgrade grants existing document managers delegable team access once, with audit and no default manager/employee grant',
    );
    const fs = require('node:fs'),
      path = require('node:path');
    const pdf = Buffer.from(
      '%PDF-1.4\n1 0 obj <</Type /Catalog>> endobj\n%%EOF\n',
    );
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=',
      'base64',
    );
    const categories = (await req('/documents/categories')).body,
      category = categories[0].id;
    const foreignCategory = (
      await request('/documents/categories', 'GET', undefined, b.cookie)
    ).body[0].id;
    async function upload(
      endpoint,
      fields,
      bytes = pdf,
      name = 'contract.pdf',
      mime = 'application/pdf',
      cookie = a.cookie,
      csrf = true,
    ) {
      const form = new FormData();
      for (const [k, v] of Object.entries(fields))
        if (v !== null && v !== undefined) form.append(k, String(v));
      if (bytes !== null)
        form.append('file', new Blob([bytes], { type: mime }), name);
      const response = await fetch(base + endpoint, {
        method: 'POST',
        headers: { Cookie: cookie, ...(csrf ? { 'X-HRMS-Request': '1' } : {}) },
        body: form,
      });
      return { status: response.status, body: await response.json() };
    }
    const createBody = (extra = {}) => ({
      employee_id: staff.id,
      category_id: category,
      title: 'Employment contract',
      visibility: 'hr_only',
      issue_date: '2026-01-01',
      expiry_date: '2027-01-01',
      reason: 'Approved test document',
      operation_id: randomUUID(),
      ...extra,
    });
    const detail = async (id, cookie = a.cookie) => {
      const r = await request('/documents/' + id, 'GET', undefined, cookie);
      expectStatus(r, 200);
      return r.body;
    };
    const metadata = async (id, extra = {}) => {
      const body = {
        ...createBody(),
        ...extra,
        revision: (await detail(id)).revision,
      };
      delete body.employee_id;
      delete body.operation_id;
      return body;
    };
    const action = async (id) => ({
      revision: (await detail(id)).revision,
      reason: 'Reviewed document action',
    });
    expectStatus(
      await upload(
        '/documents',
        createBody(),
        pdf,
        'contract.pdf',
        'application/pdf',
        staff.cookie,
      ),
      403,
    );
    expectStatus(
      await upload(
        '/documents',
        createBody(),
        pdf,
        'contract.pdf',
        'application/pdf',
        platform.cookie,
      ),
      403,
    );
    expectStatus(
      await upload(
        '/documents',
        createBody(),
        pdf,
        'contract.pdf',
        'application/pdf',
        a.cookie,
        false,
      ),
      403,
    );
    expectStatus(
      await upload('/documents', createBody({ category_id: foreignCategory })),
      400,
    );
    expectStatus(
      await upload('/documents', createBody({ expiry_date: '2025-01-01' })),
      400,
    );
    expectStatus(
      await upload('/documents', createBody({ issue_date: '2026-02-30' })),
      400,
    );
    expectStatus(await upload('/documents', createBody(), null), 400);
    expectStatus(
      await upload(
        '/documents',
        createBody(),
        Buffer.from('<script>bad</script>'),
      ),
      400,
    );
    expectStatus(
      await upload(
        '/documents',
        createBody(),
        pdf,
        'contract.png',
        'image/png',
      ),
      400,
    );
    expectStatus(
      await upload(
        '/documents',
        createBody(),
        Buffer.alloc(10 * 1024 * 1024 + 1),
        'large.pdf',
      ),
      413,
    );
    pass(
      'upload permissions, CSRF, tenant categories, strict dates, file signature/type and size limits',
    );

    const original = createBody();
    const duplicates = await Promise.all([
      upload('/documents', original),
      upload('/documents', original),
    ]);
    duplicates.forEach((r) => expectStatus(r, 201));
    assert.equal(duplicates[0].body.id, duplicates[1].body.id);
    const id = duplicates[0].body.id;
    let doc = await detail(id);
    assert.equal(doc.versions.length, 1);
    assert(!JSON.stringify(doc).includes('object_key'));
    const v1 = doc.versions[0].id;
    expectStatus(
      await upload('/documents', { ...original, title: 'Different' }),
      409,
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, b.cookie),
      404,
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, staff.cookie),
      404,
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, boss.cookie),
      404,
    );
    assert.equal(
      (await request('/documents', 'GET', undefined, staff.cookie)).body.total,
      0,
    );
    const stale = await metadata(id, { visibility: 'employee' });
    expectStatus(await req('/documents/' + id, 'PUT', stale), 200);
    expectStatus(await req('/documents/' + id, 'PUT', stale), 409);
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, staff.cookie),
      200,
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, other.cookie),
      404,
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, boss.cookie),
      404,
    );
    pass(
      'idempotent creation, private metadata, ownership and stale metadata protection',
    );

    await db.query(
      "INSERT INTO role_permissions(tenant_id,role_id,permission_code) SELECT tenant_id,id,'documents.read.team' FROM roles WHERE tenant_id=$1 AND code='manager'",
      [a.id],
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, boss.cookie),
      404,
    );
    expectStatus(
      await req(
        '/documents/' + id,
        'PUT',
        await metadata(id, { visibility: 'team' }),
      ),
      200,
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, boss.cookie),
      200,
    );
    const unrelated = await upload(
      '/documents',
      createBody({ employee_id: other.id, visibility: 'team' }),
    );
    expectStatus(unrelated, 201);
    expectStatus(
      await request(
        '/documents/' + unrelated.body.id,
        'GET',
        undefined,
        boss.cookie,
      ),
      404,
    );
    assert.equal(
      (await request('/documents', 'GET', undefined, boss.cookie)).body.total,
      1,
    );
    await db.query('UPDATE employees SET manager_id=NULL WHERE id=$1', [
      staff.id,
    ]);
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, boss.cookie),
      404,
    );
    await db.query('UPDATE employees SET manager_id=$1 WHERE id=$2', [
      boss.id,
      staff.id,
    ]);
    pass(
      'team document permission is explicit and follows current direct-report scope',
    );

    const versionBody = { ...(await action(id)), operation_id: randomUUID() };
    const versionResults = await Promise.all([
      upload(
        `/documents/${id}/versions`,
        versionBody,
        png,
        'scan.png',
        'image/png',
      ),
      upload(
        `/documents/${id}/versions`,
        versionBody,
        png,
        'scan.png',
        'image/png',
      ),
    ]);
    versionResults.forEach((r) => expectStatus(r, 201));
    doc = await detail(id);
    assert.equal(doc.versions.length, 2);
    const v2 = doc.versions[0].id;
    assert.equal(doc.versions[0].version, 2);
    const download = await fetch(
      base + `/documents/${id}/versions/${v2}/download`,
      { headers: { Cookie: staff.cookie } },
    );
    assert.equal(download.status, 200);
    assert.equal(download.headers.get('cache-control'), 'no-store');
    assert.equal(download.headers.get('x-content-type-options'), 'nosniff');
    assert.match(download.headers.get('content-disposition'), /^attachment/);
    assert(png.equals(Buffer.from(await download.arrayBuffer())));
    const wrong = await fetch(
      base + `/documents/${unrelated.body.id}/versions/${v2}/download`,
      { headers: { Cookie: a.cookie } },
    );
    assert.equal(wrong.status, 404);
    const cross = await fetch(
      base + `/documents/${id}/versions/${v2}/download`,
      { headers: { Cookie: b.cookie } },
    );
    assert.equal(cross.status, 404);
    const parallel = await action(id);
    const races = await Promise.all([
      upload(`/documents/${id}/versions`, {
        ...parallel,
        operation_id: randomUUID(),
      }),
      upload(`/documents/${id}/versions`, {
        ...parallel,
        operation_id: randomUUID(),
      }),
    ]);
    assert.deepEqual(
      races.map((r) => r.status).sort((a, b) => a - b),
      [201, 409],
    );
    await assert.rejects(
      () =>
        db.query(
          "UPDATE document_versions SET original_filename='tampered.pdf' WHERE id=$1",
          [v1],
        ),
      /immutable/,
    );
    pass(
      'immutable versions, safe retries, concurrent replacement and secure binary downloads',
    );

    doc = await detail(id);
    const v3 = doc.versions[0].id;
    expectStatus(
      await req(
        `/documents/${id}/versions/${v3}/archive`,
        'POST',
        await action(id),
      ),
      201,
    );
    expectStatus(
      await req(
        `/documents/${id}/versions/${v2}/archive`,
        'POST',
        await action(id),
      ),
      201,
    );
    assert.equal((await detail(id, staff.cookie)).versions.length, 1);
    assert.equal(
      (
        await fetch(base + `/documents/${id}/versions/${v2}/download`, {
          headers: { Cookie: staff.cookie },
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(base + `/documents/${id}/versions/${v2}/download`, {
          headers: { Cookie: a.cookie },
        })
      ).status,
      200,
    );
    expectStatus(
      await req(
        `/documents/${id}/versions/${v1}/archive`,
        'POST',
        await action(id),
      ),
      409,
    );
    expectStatus(
      await req(
        '/documents/' + id,
        'PUT',
        await metadata(id, {
          expiry_date: '2026-01-02',
          visibility: 'employee',
        }),
      ),
      200,
    );
    assert(
      (await req('/documents?expiry=expired')).body.items.some(
        (row) => row.id === id,
      ),
    );
    const today = (await req('/documents')).body.today;
    const future = new Date(today + 'T00:00:00Z');
    future.setUTCDate(future.getUTCDate() + 10);
    expectStatus(
      await req(
        '/documents/' + id,
        'PUT',
        await metadata(id, {
          expiry_date: future.toISOString().slice(0, 10),
          visibility: 'employee',
        }),
      ),
      200,
    );
    assert(
      (await req('/documents?expiry=expiring')).body.items.some(
        (row) => row.id === id,
      ),
    );
    const olderRevision = await action(id);
    expectStatus(
      await req(`/documents/${id}/archive`, 'POST', olderRevision),
      201,
    );
    expectStatus(
      await request('/documents/' + id, 'GET', undefined, staff.cookie),
      404,
    );
    assert(
      (await req('/documents?status=archived')).body.items.some(
        (row) => row.id === id,
      ),
    );
    expectStatus(
      await upload(`/documents/${id}/versions`, {
        ...(await action(id)),
        operation_id: randomUUID(),
      }),
      409,
    );
    expectStatus(
      await req(
        `/documents/${id}/versions/${v1}/archive`,
        'POST',
        await action(id),
      ),
      201,
    );
    pass(
      'version/document archive retains HR history, hides shared files and supports expiry filters',
    );

    process.env.DOCUMENT_TENANT_QUOTA_BYTES = '1';
    const quotaBody = createBody();
    expectStatus(await upload('/documents', quotaBody), 409);
    assert.equal(
      (
        await db.query('SELECT id FROM documents WHERE id=$1', [
          quotaBody.operation_id,
        ])
      ).length,
      0,
    );
    delete process.env.DOCUMENT_TENANT_QUOTA_BYTES;
    const {
      DocumentStorage,
    } = require('../dist/modules/documents/document-storage.service');
    const store = app.get(DocumentStorage),
      save = store.save.bind(store);
    store.save = async () => {
      throw new Error('Synthetic storage outage');
    };
    const failed = createBody();
    expectStatus(await upload('/documents', failed), 500);
    assert.equal(
      (
        await db.query('SELECT id FROM documents WHERE id=$1', [
          failed.operation_id,
        ])
      ).length,
      0,
    );
    store.save = save;
    expectStatus(await upload('/documents', failed), 201);
    const stored = (
      await db.query('SELECT object_key FROM document_versions WHERE id=$1', [
        v1,
      ])
    )[0];
    fs.writeFileSync(
      path.join(process.env.DOCUMENT_STORAGE_DIR, stored.object_key),
      'tampered',
    );
    assert.equal(
      (
        await fetch(base + `/documents/${id}/versions/${v1}/download`, {
          headers: { Cookie: a.cookie },
        })
      ).status,
      503,
    );
    const audits = await db.query(
      "SELECT action FROM audit_logs WHERE tenant_id=$1 AND entity_type='document'",
      [a.id],
    );
    for (const name of [
      'uploaded',
      'version_uploaded',
      'metadata_updated',
      'version_archived',
      'archived',
      'downloaded',
    ])
      assert(audits.some((row) => row.action === 'document.' + name));
    pass(
      'quota/storage failures roll back metadata, file integrity is checked and actions are audited',
    );
    console.log(`Document integration checks passed: ${checks}`);
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

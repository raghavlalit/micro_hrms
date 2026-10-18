const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');

// Reuses the disposable leave-test database; never modifies a real company.
module.exports = async function assignmentChecks({
  app,
  db,
  a,
  b,
  req,
  request,
  staff,
  boss,
  policy,
  policyBody,
  expectStatus,
  pass,
}) {
  const {
    BackgroundJobs,
  } = require('../dist/modules/background-jobs/background-jobs.service');
  const {
    LeaveAssignmentJobs,
  } = require('../dist/modules/leave/leave-assignment-jobs.service');
  const {
    BackgroundProcessor,
  } = require('../dist/modules/background-jobs/background-processor.service');
  const {
    PayslipGeneration,
  } = require('../dist/modules/payroll/payslip-generation.service');
  const {
    ReportExports,
  } = require('../dist/modules/reports/report-export.service');
  const jobs = app.get(BackgroundJobs),
    assignments = app.get(LeaveAssignmentJobs);
  const processor = new BackgroundProcessor(
    jobs,
    app.get(PayslipGeneration),
    app.get(ReportExports),
    assignments,
  );
  const ready = (id) =>
    db.query(
      "UPDATE background_jobs SET available_at=now()-interval '1 minute' WHERE id=$1",
      [id],
    );
  const run = async (id) => {
    await ready(id);
    await processor.process(a.id, id);
  };
  const get = (id) => req(`/leave/assignments/jobs/${id}`);
  const filters = {
    year: 2028,
    policy_id: policy,
    search: 'BULK-',
    page: 1,
    limit: 20,
  };
  const previewBody = (extra) => ({
    operation_id: randomUUID(),
    policy_id: policy,
    year: 2028,
    carry_forward: 0,
    credited: 18,
    reason: 'Reviewed test assignment',
    all_matching: true,
    filters,
    ...extra,
  });
  const preview = (body) => req('/leave/assignments/preview', 'POST', body);
  const confirm = (id) => req(`/leave/assignments/jobs/${id}/confirm`, 'POST');
  const directory = (extra) =>
    req('/leave/assignments?' + new URLSearchParams({ ...filters, ...extra }));

  expectStatus(
    await request(
      '/leave/assignments?year=2028',
      'GET',
      undefined,
      staff.cookie,
    ),
    403,
  );
  expectStatus(
    await request(
      '/leave/assignments?year=2028',
      'GET',
      undefined,
      boss.cookie,
    ),
    403,
  );
  expectStatus(await req('/leave/assignments?year=nope'), 400);
  expectStatus(await req('/leave/assignments?year=2028&limit=1000'), 400);
  expectStatus(await preview(previewBody({ filters: undefined })), 400);
  expectStatus(await preview(previewBody({ filters: { year: 2027 } })), 400);
  expectStatus(await preview(previewBody({ carry_forward: 1 })), 400);
  pass(
    'assignment management permission, required filters and year/batch limits',
  );

  await db.query(
    `INSERT INTO employees (tenant_id,employee_code,first_name,last_name,joining_date,employment_type,status)
    SELECT $1,'BULK-'||n,'Bulk',n::text,'2026-01-01','Full-time','active' FROM generate_series(1,1000) n`,
    [a.id],
  );
  const first = await directory();
  expectStatus(first, 200);
  assert.equal(first.body.total, 1000);
  assert.equal(first.body.items.length, 20);
  assert.equal(first.body.summary.unassigned, 1000);
  assert(first.body.items.every((e) => e.expected === 1 && e.assigned === 0));
  const second = await directory({ page: 2 });
  assert.equal(second.body.items.length, 20);
  assert(
    !first.body.items.some((e) =>
      second.body.items.some((other) => other.id === e.id),
    ),
  );
  const foreign = await request(
    '/leave/assignments?' + new URLSearchParams(filters),
    'GET',
    undefined,
    b.cookie,
  );
  assert.equal(foreign.body.total, 0);
  pass(
    '1000-employee directory paginates and counts on the server with tenant isolation',
  );

  const selected = first.body.items[0];
  const setup = await req(
    `/leave/employees/${selected.id}/entitlements`,
    'POST',
    {
      policy_id: policy,
      year: 2028,
      credited: 7,
      reason: 'Existing reviewed entitlement',
    },
  );
  expectStatus(setup, 201);
  const beforeEntries = await db.query(
    'SELECT * FROM leave_balance_entries WHERE balance_id=$1 ORDER BY id',
    [setup.body.id],
  );
  const body = previewBody();
  const draft = await preview(body);
  expectStatus(draft, 201);
  assert.equal(draft.body.status, 'draft');
  assert.equal(draft.body.counts.assignable, 999);
  assert.equal(draft.body.counts.skipped, 1);
  assert.equal((await preview(body)).body.id, draft.body.id);
  expectStatus(await preview({ ...body, credited: 19 }), 409);
  expectStatus(
    await request(
      `/leave/assignments/jobs/${draft.body.id}`,
      'GET',
      undefined,
      b.cookie,
    ),
    404,
  );
  assert.equal(await jobs.claim(a.id, draft.body.id), null);
  assert.equal((await directory()).body.summary.assigned, 1);
  // A new matching employee after preview must not silently join the frozen batch.
  await db.query(
    `INSERT INTO employees (tenant_id,employee_code,first_name,last_name,joining_date,employment_type,status)
    VALUES ($1,'BULK-LATER','Bulk','Later','2026-01-01','Full-time','active')`,
    [a.id],
  );
  expectStatus(await confirm(draft.body.id), 202);
  expectStatus(await confirm(draft.body.id), 202);
  await run(draft.body.id);
  const complete = await get(draft.body.id);
  assert.equal(
    complete.body.status,
    'completed',
    JSON.stringify(complete.body),
  );
  assert.equal(complete.body.counts.assigned, 999);
  assert.equal(complete.body.counts.skipped, 1);
  assert.equal(complete.body.completed_units, 1000);
  const after = await directory();
  assert.equal(after.body.summary.assigned, 1000);
  assert.equal(after.body.summary.unassigned, 1);
  assert.equal(
    (
      await db.query('SELECT credited FROM leave_balances WHERE id=$1', [
        setup.body.id,
      ])
    )[0].credited,
    '7.00',
  );
  assert.deepEqual(
    await db.query(
      'SELECT * FROM leave_balance_entries WHERE balance_id=$1 ORDER BY id',
      [setup.body.id],
    ),
    beforeEntries,
  );
  const page20 = await req(`/leave/assignments/jobs/${draft.body.id}?page=20`);
  assert.equal(page20.body.items.length, 50);
  await run(draft.body.id);
  assert.equal((await directory()).body.summary.assigned, 1000);
  pass(
    'preview is side-effect free; confirmed 1000-person frozen batch preserves existing credit/history and is idempotent',
  );

  const dept = (await req('/leave/assignments/departments')).body[0];
  const scopedType = await req('/leave/types', 'POST', {
    code: 'SCOPED',
    name: 'Scoped leave',
    is_active: true,
  });
  const scopedBody = {
    ...policyBody,
    leave_type_id: scopedType.body.id,
    name: 'Department policy',
    applicability: { department_id: dept.id },
    effective_from: '2028-01-01',
  };
  const scopedPolicy = await req('/leave/policies', 'POST', scopedBody);
  expectStatus(scopedPolicy, 201);
  await db.query('UPDATE employees SET department_id=$1 WHERE id=$2', [
    dept.id,
    selected.id,
  ]);
  const partial = await directory({
    policy_id: '',
    search: selected.employee_code,
  });
  // Empty UUID filters are rejected; omit the policy filter for completeness across types.
  expectStatus(partial, 400);
  const allTypes = await req(
    '/leave/assignments?' +
      new URLSearchParams({
        year: 2028,
        search: selected.employee_code,
        status: 'partial',
      }),
  );
  expectStatus(allTypes, 200);
  assert(
    allTypes.body.items.some(
      (e) => e.id === selected.id && e.assigned < e.expected,
    ),
  );
  const scopeDraft = await preview(
    previewBody({
      policy_id: scopedPolicy.body.id,
      all_matching: false,
      employee_ids: [selected.id, staff.id],
    }),
  );
  expectStatus(scopeDraft, 201);
  assert.equal(scopeDraft.body.counts.assignable, 1);
  assert.equal(scopeDraft.body.counts.rejected, 1);
  expectStatus(
    await req(`/leave/employees/${staff.id}/entitlements`, 'POST', {
      policy_id: scopedPolicy.body.id,
      year: 2028,
      reason: 'Out of scope assignment',
    }),
    400,
  );
  await db.query('UPDATE employees SET department_id=NULL WHERE id=$1', [
    selected.id,
  ]);
  expectStatus(await confirm(scopeDraft.body.id), 202);
  await run(scopeDraft.body.id);
  assert.equal((await get(scopeDraft.body.id)).body.counts.rejected, 2);
  pass(
    'department applicability, partial status and changed employee eligibility are enforced',
  );

  const changed = await preview(
    previewBody({
      year: 2029,
      filters: { year: 2029 },
      all_matching: false,
      employee_ids: [staff.id],
    }),
  );
  expectStatus(changed, 201);
  await req(`/leave/policies/${policy}`, 'PUT', {
    ...policyBody,
    name: 'Updated annual policy',
  });
  expectStatus(await confirm(changed.body.id), 409);
  const expiring = await preview(
    previewBody({
      year: 2029,
      filters: { year: 2029 },
      all_matching: false,
      employee_ids: [staff.id],
    }),
  );
  await db.query(
    "UPDATE background_jobs SET expires_at=now()-interval '1 second' WHERE id=$1",
    [expiring.body.id],
  );
  assert.equal((await get(expiring.body.id)).body.status, 'expired');
  expectStatus(await confirm(expiring.body.id), 409);
  pass('changed policies and expired previews require fresh review');

  const interrupted = await preview(
    previewBody({
      year: 2030,
      filters: { year: 2030 },
      all_matching: false,
      employee_ids: [staff.id, boss.id],
    }),
  );
  expectStatus(interrupted, 201);
  await confirm(interrupted.body.id);
  const original = assignments.balances.setupInTransaction.bind(
    assignments.balances,
  );
  let calls = 0;
  assignments.balances.setupInTransaction = async (...args) => {
    if (++calls === 2) throw new Error('simulated worker interruption');
    return original(...args);
  };
  try {
    await run(interrupted.body.id);
  } finally {
    assignments.balances.setupInTransaction = original;
  }
  let interruptedState = await get(interrupted.body.id);
  assert.equal(interruptedState.body.status, 'pending');
  assert.equal(interruptedState.body.counts.assigned, 1);
  // Exercise manual retry too: its reset must preserve the committed outcome.
  await db.query("UPDATE background_jobs SET status='failed' WHERE id=$1", [
    interrupted.body.id,
  ]);
  expectStatus(
    await req(`/leave/assignments/jobs/${interrupted.body.id}/retry`, 'POST'),
    202,
  );
  await run(interrupted.body.id);
  interruptedState = await get(interrupted.body.id);
  assert.equal(interruptedState.body.status, 'completed');
  assert.equal(interruptedState.body.counts.assigned, 2);
  const credited = await db.query(
    "SELECT count(*)::int AS total FROM leave_balances WHERE tenant_id=$1 AND period_start='2030-01-01' AND employee_id IN ($2,$3)",
    [a.id, staff.id, boss.id],
  );
  assert.equal(credited[0].total, 2);
  pass(
    'interrupted worker and manual retry retain atomic outcomes without duplicate entitlements',
  );
  const options = await req(
    `/leave/assignments/employees/${staff.id}/policies?year=2030`,
  );
  expectStatus(options, 200);
  assert(
    !options.body.some(
      (row) => row.id === policy || row.id === scopedPolicy.body.id,
    ),
  );
  const nextOptions = await req(
    `/leave/assignments/employees/${staff.id}/policies?year=2031`,
  );
  assert(nextOptions.body.some((row) => row.id === policy));
  expectStatus(
    await request(
      `/leave/assignments/employees/${staff.id}/policies?year=2031`,
      'GET',
      undefined,
      b.cookie,
    ),
    404,
  );
  expectStatus(
    await req('/leave/policies', 'POST', {
      ...policyBody,
      applicability: null,
    }),
    400,
  );
  pass(
    'individual policy options exclude assigned and inapplicable policies and protect tenant scope',
  );

  const racing = await preview(
    previewBody({
      year: 2031,
      filters: { year: 2031 },
      all_matching: false,
      employee_ids: [staff.id, boss.id],
    }),
  );
  expectStatus(racing, 201);
  expectStatus(
    await req(`/leave/employees/${staff.id}/entitlements`, 'POST', {
      policy_id: policy,
      year: 2031,
      credited: 6,
      reason: 'Concurrent individual grant',
    }),
    201,
  );
  await confirm(racing.body.id);
  const originalIdentity = assignments.identity.resolve.bind(
    assignments.identity,
  );
  assignments.identity.resolve = async (...args) => ({
    ...(await originalIdentity(...args)),
    permissions: [],
  });
  try {
    await run(racing.body.id);
  } finally {
    assignments.identity.resolve = originalIdentity;
  }
  const denied = await get(racing.body.id);
  assert.equal(denied.body.status, 'failed');
  assert.equal(denied.body.error_code, 'ACCESS_CHANGED');
  assert.equal(denied.body.completed_units, 0);
  expectStatus(
    await req(`/leave/assignments/jobs/${racing.body.id}/retry`, 'POST'),
    202,
  );
  await run(racing.body.id);
  const reconciled = await get(racing.body.id);
  assert.equal(reconciled.body.counts.skipped, 1);
  assert.equal(reconciled.body.counts.assigned, 1);
  pass(
    'worker rechecks requester access and skips individual grants made after preview',
  );
};

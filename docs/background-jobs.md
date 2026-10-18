# Background payslips and report exports

Payslip PDF generation and large CSV exports run in a separate NestJS/BullMQ
worker. HTTP requests queue work and return **202 Accepted**. Closing the page or
signing out does not cancel a job. PostgreSQL is the durable source of job state;
Redis contains only tenant/job UUID references.

The same worker also processes confirmed bulk leave assignments. Draft previews
are never processed automatically. Employee credits and outcomes commit together,
and retries preserve previous outcomes. See [employee leave assignment](leave-assignments.md).

## Local setup

From the repository root, with the existing database and notification environment:

```powershell
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run notifications:up
npm.cmd run jobs:worker
```

The last command stays running in its terminal. Start `npm.cmd run dev:api` and
`npm.cmd run dev:web` in separate terminals when needed. Run
`npm.cmd run notifications:worker` separately for configured email delivery.
`jobs:worker` does not send SMTP itself. Stop each foreground process with Ctrl+C.

Both API and workers load `apps/api/.env`. Existing local defaults work without
new secrets. Do not run `db:setup` over an existing environment just for this feature.

| Setting | Default / purpose |
|---|---|
| `REDIS_URL` | `redis://127.0.0.1:6380`; shared Redis connection configuration |
| `BACKGROUND_QUEUE_PREFIX` | `microhrms`; use distinct names per environment |
| `REPORT_EXPORT_STORAGE_DIR` | Private `apps/api/storage/report-exports` |
| `PAYSLIP_STORAGE_DIR` | Private `apps/api/storage/payslips` |
| `PAYSLIP_FONT_PATH` | Optional readable TTF/OTF; required for non-ASCII payslip text |

API and generation workers **must share the same storage directories**. Use
absolute paths for containers or separate working directories. Never expose them
as static web folders. Restrict filesystem access to service operators; published
payslips require persistent storage and coordinated database/file backups.

For a built server image, the worker command is:

```sh
node apps/api/dist/modules/background-jobs/worker-main.js
```

It exposes no HTTP port. Run it under the same supervisor/container conventions
as the email worker, using the runtime database account, matching environment,
private Redis access, shared payslip/export volumes and the font mounted in the
worker. Apply migrations before starting the new API and worker. Allow graceful
shutdown time for an active job; forced termination is recoverable through leases.
Deployment itself remains deferred.

## Payslip workflow

1. Calculate, review and lock the payroll run using the existing workflow.
2. Choose **Generate and publish payslips** on the locked run. The publish endpoint
   now returns 202 with `{ id, published: false, job }`.
3. The screen polls `GET /payroll/runs/:id/payslip-job` every five seconds.
4. The worker reads locked salary snapshots and writes private PDFs. Progress
   shows completed PDFs and the total. No payslip becomes downloadable mid-batch.
5. One transaction publishes the whole batch, completes the job, and records the
   audit and employee notifications. Existing employee download URLs are unchanged.
6. If all attempts fail, correct the reported issue and choose **Retry generation**.
   This repeats the publish request for the same locked run/version. Concurrent
   or repeated requests do not create a second publication.

The requesting account must remain active with `payroll.manage` through final
publication. Another authorized payroll administrator can retry a failed batch.
An already published run returns `{ published: true, replayed: true, job: null }`.
Generation does not transfer money. Existing published PDFs remain available.

## Report workflow

1. Open **Reports**, choose the report and apply filters.
2. Choose **Queue CSV export**, including when preview reports the 5,000-row limit.
   The queue uses the last applied filters, not unfinished form edits.
3. Open **My exports**. Status refreshes every ten seconds; Refresh is also available.
4. Download completed files within 24 hours. Failed jobs offer **Retry export**.
   Expired jobs require a new export request.

| Endpoint | Behavior |
|---|---|
| `POST /reports/:kind/export-jobs` | 202; report filters plus required `operation_id` UUID |
| `GET /report-exports` | Owner's paginated history (`page`, `limit`) |
| `GET /report-exports/:id` | Owner's safe job status and progress |
| `POST /report-exports/:id/retry` | 202; `{}`; failed jobs only, owner/current access required |
| `GET /report-exports/:id/download` | CSV; 409 when not ready, 410 when expired |

Paths above are relative to `/api/v1`. For a fresh snapshot use a new operation
UUID. Repeating an uncertain request with the same UUID and filters returns the
same job; changing filters under that UUID returns 409. Filters are fixed at
enqueue time (including default dates/year), but data is read when execution
runs. Retries may reflect intervening data changes. Reports remain operational
views, not a transactionally frozen multi-module snapshot.

Small previews/synchronous CSV exports remain limited to 5,000 rows. Queued CSV
exports allow **100,000 rows and 50 MiB**, with no silent truncation. Attendance
still allows at most 31 days and checks potential employee/day rows before status
filtering; leave reports allow at most 366 days. CSV quoting, UTF-8 BOM and formula
protection match synchronous exports. XLSX/PDF reports and scheduled delivery are
outside this feature.

Exports are owner-only, even for another company administrator. Generation,
publication and download recheck current account/report/domain permissions.
Team downloads also verify every exported employee remains in the requester's
current scope. Moving a team member can invalidate the old file; request a new
export. File keys, employee ID lists, payloads and CSV contents never appear in
public job metadata or Redis. Downloads use `Cache-Control: no-store`.

## Durability, limits and operations

- At most three pending/running jobs per requester across both job types.
- Dispatcher polls due references every five seconds. Work queued while the
  worker or Redis is stopped remains in PostgreSQL and is discovered later.
- Each worker processes one job at a time. A two-minute database lease renews
  every twenty seconds; a unique lease token fences stale workers. Forced stops
  can delay recovery until the lease expires. Database/worker clocks must agree.
- Transient failures get three attempts with a ten-second delay. Access/input/
  size failures stop immediately. Manual retry resets the attempt budget after
  current authorization checks. Error codes are sanitized; no private exception
  messages are sent to the browser or queue logs.
- Completed report files expire 24 hours after completion. Downloads are denied
  immediately at expiry; the running worker later deletes the file and clears its
  result metadata. Suspended/archived companies are excluded from discovery, so
  their cleanup waits for reactivation or a separately reviewed retention process.
- Rows and CSV are currently materialized in worker memory within the stated
  limits; this is not streaming. Monitor memory, disk, job age, failures and worker
  health before increasing concurrency or capacity.
- A crash after file creation and before commit can leave an unreferenced file.
  Report attempts use distinct file keys; normal failed attempts remove their
  files. Operator cleanup of crash leftovers must compare database references
  and active leases first. Do not delete payslips merely based on file age.

Common codes: `ACCESS_CHANGED` (restore permission or use an authorized retry),
`INPUT_CHANGED` (review inputs/font support), `EXPORT_TOO_LARGE` (narrow filters),
`RESOURCE_UNAVAILABLE` (review source data), `GENERATION_FAILED` (storage/service
problem), and `WORKER_INTERRUPTED` (repeated worker loss). Do not automatically
retry without fixing a persistent fault.

## Schema and module ownership

Migration `1791500000000-BackgroundJobs` adds `background_jobs`: UUID identity and
tenant, requester FK to `(users.tenant_id, users.id)`, kind/resource reference,
deduplication key/hash, private payload/result JSONB, status/attempts/progress,
sanitized error, lease token and scheduling/start/completion/expiry timestamps.
`(tenant_id, kind, request_key)` is unique. A tenant FK, forced RLS and runtime
SELECT/INSERT/UPDATE grants protect the table. Runtime DELETE is not granted.
`background_job_candidates` exposes only due IDs, tenant IDs and scheduling time
for active companies. Existing unused `export_jobs` remains a legacy schema table;
new exports use `background_jobs` exclusively.

Generic scheduling, leases and Redis configuration belong to `modules/background-jobs`.
PDF generation stays in `modules/payroll`; CSV generation/storage stays in
`modules/reports`; live worker identity resolution stays in `modules/auth`.
Angular screens stay in `features/payroll` and `features/reports`. Runtime database
operations use TypeORM repositories and QueryBuilder inside tenant transactions.

## Verification

```powershell
npm.cmd run db:test
npm.cmd run payroll:test
npm.cmd run jobs:test
npm.cmd run reports:test
npm.cmd test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run postman:check
```

Integration tests use disposable local databases and synthetic data. `jobs:test`
also requires local Redis on port 6380 and uses an isolated queue namespace.
Coverage includes a 5,005-row export, private downloads, changed team/account
access, partial PDF failure, retries, lease fencing, expiry and real Redis dispatch.
See Postman folders **11 Payroll and payslips** and **13 Dashboard and reports**.

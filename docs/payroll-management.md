# Payroll management

Phase 1 supports monthly fixed salaries, calendar-day proration, audited manual
adjustments, calculation history, review, locking and private PDF payslips.
Approved unpaid-leave deductions are **off until HR enables them**. There are no
automatic statutory rates, bank payments, emails or attendance-absence deductions.

## First company setup

1. Sign in as company admin or HR with `payroll.manage`.
2. Open **Salary components**. Review the company's earning and deduction masters.
   Component kind cannot change after it is used in a salary or payroll line.
3. Open **Payroll > Salary structures**, select each employee and assign monthly
   component amounts with an effective date and reason. Enter money as decimal
   strings, for example `"60000.00"` in API requests.
4. Add later salary revisions in chronological order. The previous revision ends
   the day before the next starts. Correct amounts only when the affected period
   does not intersect locked payroll. Removing a component retains a zero line.
5. If required, enable **Deduct approved unpaid leave in new payroll runs** and
   save. Each run captures this setting; changing it does not alter existing runs.
6. Create the month and pay date. There can be only one run for a month. Its
   currency comes from company settings; salary currencies must match.
7. Calculate. Every eligible employment day requires exactly one salary revision.
   Missing coverage fails the entire calculation with the employee/date to fix.
8. Review employee lines, exclusions and totals. Add manual earnings/deductions
   with reasons when needed. Correct or void adjustments by setting their amount
   to zero. These changes clear the reviewed state.
9. Recalculate when salary, employment or approved unpaid-leave inputs change.
   A new version retains the earlier calculation. Explicitly confirm discarding
   current manual adjustments; they are not automatically copied to the new version.
10. Mark reviewed, then lock **after the month has ended in company time**. Resolve
    all pending leave requests and attendance corrections for the period first.
    The server checks input changes again. There is no unlock workflow.
11. Publish payslips. Employees with `payslips.read.self` see their statements in
    **My payslips**. HR can view/download from the locked run. Publishing does not
    confirm payment. Repeating publication returns the existing published result.

## Calculation rules

Eligible statuses are `active`, `on_notice` and `terminated`, with joining/leaving
dates intersecting the month. Invited/inactive employees are listed as excluded;
archived employees are outside the payroll directory. Review exclusions explicitly.

For each component, sum its monthly amount for every covered employment date,
then divide by calendar days in the month. Joining and termination dates are
inclusive. A September 16 joiner at 60,000 earns `60000 × 15 / 30 = 30000.00`.
Mid-month revisions use the amount applicable to each date. Fixed deductions use
the same proration. Weekends and holidays remain calendar days in this formula.

When enabled, unpaid leave uses approved requests' saved charged dates and halves.
For each charged day, deduct that day's monthly earnings divided by calendar days;
a half-day multiplies by 0.5. At 60,000 monthly earnings in September, a half-day
deducts 1,000.00. Fixed deductions are not reduced by unpaid leave. Pending,
cancelled, rejected and paid leave do not create this deduction. Legacy approved
unpaid requests without calculation snapshots require reconciliation first.

Money arithmetic uses integer cents and half-up rounding. Components are rounded
once after combining revisions; unpaid leave is rounded once per employee. Totals
sum rounded lines, and negative net pay is rejected. The currency is displayed
explicitly; this release supports two decimal places only.

## API and concurrency

All paths below start with `/api/v1`. Payroll management requires a tenant session
and `payroll.manage`. Platform admin credentials do not authorize company payroll.
Mutations require `X-HRMS-Request: 1`, the session cookie and an allowed Origin.

| Method     | Path                                  | Purpose                                                                    |
| ---------- | ------------------------------------- | -------------------------------------------------------------------------- |
| GET / PUT  | `/payroll/settings`                   | Read/save unpaid-leave default                                             |
| GET        | `/payroll/people`                     | Scoped paginated employee directory                                        |
| GET / POST | `/payroll/employees/:id/salaries`     | History/new salary revision                                                |
| PUT        | `/payroll/salaries/:id`               | Correct salary amounts                                                     |
| GET / POST | `/payroll/runs`                       | List/create monthly runs                                                   |
| GET        | `/payroll/runs/:id`                   | Current calculation, revision and versions                                 |
| GET        | `/payroll/runs/:id/versions/:version` | Earlier employee calculations                                              |
| POST       | `/payroll/runs/:id/calculate`         | Calculate a new version                                                    |
| POST       | `/payroll/runs/:id/review`            | Mark reviewed                                                              |
| POST       | `/payroll/runs/:id/lock`              | Freeze reviewed payroll                                                    |
| POST       | `/payroll/runs/:id/publish`           | Publish private PDFs                                                       |
| POST       | `/payroll/employees/:id/adjustments`  | Add adjustment; ID is a **payroll employee item**, not an employee profile |
| PUT        | `/payroll/adjustments/:id`            | Correct/void manual line                                                   |
| GET        | `/payslips/me`                        | Current user's published statements                                        |
| GET        | `/payslips/:id`                       | Owner or payroll manager detail                                            |
| GET        | `/payslips/:id/download`              | Authorized PDF stream                                                      |

Fetch run detail before each mutation. Pass `calculation_config.revision` as
`revision`; review/lock/publish/adjustment bodies also carry `calculation_version`.
Each change rotates the revision. A 409 means refresh and review current data.
For an adjustment, generate one `operation_id` UUID and retain it for retries.
Editing also supplies `expected_amount`. No runtime history records are deleted.

Tenant row locks serialize payroll and related employee/leave/attendance writes.
RLS, tenant-aware foreign keys and permission checks enforce isolation. Locked
run/item/line database triggers protect amounts. PDFs contain locked snapshot
values and do not change when the employee profile changes later. File keys are
never exposed. Publication/downloads do not expose bank or statutory identifiers.

Use **11 - Payroll and payslips** in the shared [Postman collection](../postman/README.md).

## Database and deployment

Migration `1791385000000-PayrollVersions` adds:

- `payroll_runs.calculation_version`: integer, not null, default 0.
- `payroll_employees.calculation_version`: integer, not null, default 1.
- Unique `(tenant_id, payroll_run_id, employee_id, calculation_version)` instead
  of the earlier three-column constraint; existing snapshots are version 1.
- Restricted runtime `UPDATE(settings)` permission on `tenants` for payroll settings.

Existing `salary_structures`, `salary_structure_lines`, `payroll_lines`, `payslips`
and tenant-aware foreign keys continue to be used. No real salary data is seeded.
Rollback refuses to discard multiple calculation versions; use a forward fix.

Local Windows update:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run db:smoke
```

For Ubuntu UAT/production, back up the database and private storage, deploy the
matching API/web build, and execute migrations once using the migrator connection.
Keep that credential out of the running API. Example, from the release directory
with deployment environment variables already injected:

```bash
npm ci
npm run build
npm run migration:run --workspace=apps/api
npm run migration:show --workspace=apps/api
```

In Docker Compose, run the migration command as a one-off job using the release
image and migrator environment, then restart API/web with the runtime environment.
The repository's `compose.yaml` starts local PostgreSQL only; the following is an
addition to your UAT/production API service, not a standalone Compose definition:

```yaml
services:
  api:
    environment:
      PAYSLIP_STORAGE_DIR: /var/lib/microhrms/payslips
      # Optional: mount a licensed font that covers all names used by the company.
      # PAYSLIP_FONT_PATH: /opt/microhrms/fonts/company.ttf
    volumes:
      - payslip_data:/var/lib/microhrms/payslips
      # - ./fonts:/opt/microhrms/fonts:ro
volumes:
  payslip_data:
```

Ensure the volume is writable by the API container's UID and readable only by the
service/backup administrator. Never mount it under Nginx's public web root. Local
default storage is `apps/api/storage/payslips`, ignored by Git. Production must use
persistent private storage: losing the volume loses published PDFs. Back up both
database and volume and test restoration together. Multiple API replicas require
the same private shared filesystem; an object-storage adapter is future work.

Without `PAYSLIP_FONT_PATH`, PDF generation supports printable ASCII names with
Helvetica. Publication rejects non-ASCII company/employee/component names instead
of producing broken text. Configure a readable TTF/OTF font covering every used
script and verify a sample in UAT before publishing. Custom fonts must also be
present in each API replica.

PDF writes use a temporary file and atomic rename. A transaction failure may leave
an unpublished file; retry publication safely overwrites its deterministic key.
Do not automatically delete files based on age; any retention cleanup must compare
database references and approved retention policy. Published files are immutable
through the API. Downloads require authentication and use `Cache-Control: no-store`.

After deployment, use a synthetic UAT company to assign salary, calculate a past
month, review, lock, publish and download as the employee. Verify a different
employee cannot access that PDF. Keep production payroll changes under HR review.

## Verification and limits

```powershell
npm.cmd run payroll:test
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run lint --workspace=apps/api
npm.cmd run postman:generate
npm.cmd run postman:check
```

Integration tests use disposable PostgreSQL databases and synthetic employees.
They cover precision, salary coverage, revisions, proration, unpaid leave,
concurrency, immutable locking, audits, tenant isolation and payslip ownership.
Browser checks cover management and self-service flows at desktop/mobile sizes.

This implementation publishes synchronously and is intended for Phase 1 company
sizes. High-volume background processing, payroll exports, automatic statutory
calculations, notifications, bank disbursement and post-lock correction runs are
separate features. Existing runs created outside these APIs without calculation
revision metadata require migration/reconciliation before further processing.

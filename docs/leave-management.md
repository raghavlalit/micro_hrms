# Leave management

The leave year is **January–December**, as agreed. Open **Leave** in the workspace
for balances, requests and the approved-leave calendar. Existing leave type and
policy editors remain under Policies & Settings.

## Initial setup

1. Create active leave types and policies. Review annual entitlement, paid/unpaid,
   balance control, nonworking-day exclusion, carry-forward and effective dates.
2. Link each employee to their user and assign an unambiguous work schedule.
   Their current reporting manager controls direct-report approval scope.
3. As HR/company admin, open Leave, choose the employee and year, and select
   **Assign entitlement**. Select a policy and review the credited amount.
   This atomically creates the year's balance and explicit employee assignment.
4. Assignment dates are the intersection of the calendar year, policy dates and
   employment dates. There is one entitlement per employee/leave type/year.
   Creating or editing a policy alone never grants employee balances.
5. The annual credit defaults to the policy entitlement. HR can supply a reviewed
   prorated/opening amount. There is no automatic proration or monthly accrual.
   For uncontrolled policies, use zero credit and zero carry-forward.

Carry-forward is an explicit HR transfer when assigning the new year. The policy
must permit it, the immediately previous year must have enough available balance,
and that balance must have no pending requests. The source receives a negative
adjustment and the destination a positive adjustment in the same transaction.
This prevents spending the transferred days twice. There are no automatic annual
jobs, caps or encashment rules. HR chooses when to perform the transfer.

Already assigned policies cannot change their leave type or balance-control flag.
Use a new policy in a future year for those changes. This release does not replace
an employee's policy midyear. Other policy edits affect new requests; submitted
requests retain their original calculation. Existing credits are never silently
changed by editing annual entitlement.

## Employee and reviewer workflows

- Employees select an assigned policy, dates, full/half-day choices and reason.
  **Calculate days** shows the chargeable dates and balance before submission.
  Editing the form invalidates the preview; submission revalidates on the server.
- A one-day request uses the same full/AM/PM selection at both ends. A multi-day
  request may start with PM and end with AM. Cross-year leave must be split into
  separate applications so each uses its own annual entitlement.
- Weekly offs and company/location holidays are excluded when the policy says
  so. When exclusion is disabled, calendar days count. A range with no chargeable
  dates is rejected. Holidays are deduplicated.
- Overlapping pending or approved full days/halves are rejected across all leave
  types. Complementary AM and PM requests are allowed. Policy, employment and
  assignment dates must cover the request; inactive employees cannot apply.
- Submitting controlled leave reserves units in `pending`; approval moves them
  from `pending` to `used`. Rejection or pending cancellation releases them.
  Available days are `credited + adjusted - used - pending` and cannot be negative.
- Uncontrolled leave records requested/approved units in request history without
  artificial credits or balance deductions. Its UI shows **No limit**.
- Managers review direct reports; HR can review company requests. Nobody can
  approve or reject their own request. Review comments are optional.
- Employees may cancel their own pending requests. **Approved cancellation
  requires HR** and a reason, and restores used balance. HR may also cancel
  pending requests. Whole-request cancellation is supported; there is no partial
  cancellation workflow.
- Historical applications are allowed within employment/policy dates if they do
  not conflict with attendance or locked payroll. Future applications are allowed.

## Attendance, locking and privacy

Approved chargeable days appear immediately in attendance, including future days.
Full days display Leave; a half day carries an explicit approved-leave annotation.
Actual check-in/out records are retained. Cancelling approval removes the overlay
and reveals the original record or ordinary calendar projection.

Full-day approved leave blocks attendance writes and corrections. For half-day
leave, AM/PM divide the saved work schedule at its midpoint. Attendance must stay
in the other half. Approval rechecks existing attendance, and an open check-in
must be resolved first. Morning leave adjusts the displayed lateness threshold to
the midpoint plus the saved grace period; cancellation restores ordinary lateness.
Overnight shifts are not supported. Manual HR attendance Leave markers remain
separate from leave applications and do not change balances.

Locked payroll periods block new applications, approvals and approved cancellation.
Pending rejection/cancellation can still release reservations. All leave,
attendance and future payroll-lock writers must serialize on the tenant row.
TypeORM transactions and PostgreSQL RLS enforce tenant isolation, with service
checks for employee/manager scope. Ledger entries and audit events are append-only.

The team calendar includes approved chargeable dates, employee names and full/half
days only. It omits reasons, leave categories, paid flags and review comments.
Employees see themselves, managers direct reports, and HR the company. Authorized
reviewers can see application reasons in the separate review workflow.

## Balance adjustments and audit history

HR can add or deduct days with a reason. A deduction cannot consume used or
reserved days. Each adjustment requires an `operation_id` UUID: retry the same
operation with the same ID and exact body; use a new UUID for a different action.
Retries do not duplicate credits. Entitlement setup is unique per type/year;
duplicate setup returns a conflict rather than crediting again.

Balance history lists credit, reserve, release, use, restore and signed adjustment
entries. Approval writes a reservation release plus usage; these are accounting
movements, so do not sum all ledger units as though they were credits. Audit logs
also record policy edits, entitlement setup, reviews, cancellation and adjustment
reasons. Uncontrolled usage remains in request history.

## Database and deployment

Migration `1791378000000-LeaveRequestCalculation` adds
`leave_requests.calculation jsonb NOT NULL DEFAULT '{}'` to the existing tables.
The snapshot stores charged dates/halves, balance reference, paid/control flags,
timezone, schedule times/grace, working days, applicable holidays and policy name.
Existing rows are preserved. Imported legacy requests without a snapshot require
deliberate reconciliation before transitions; the service does not invent historic
policy inputs or balance movements.

Apply migrations before serving the new application:

```powershell
npm.cmd run db:migrate
npm.cmd run db:status
```

On Ubuntu/UAT/production use `npm run build:api` followed by
`npm run migration:run --workspace=apps/api` in the existing deployment migration
job, with migration credentials supplied only to that job. Keep runtime credentials
restricted, `synchronize=false`, and follow [database setup](database-setup.md).
No employee, policy, entitlement or demo leave data is seeded by this feature.

## API and ownership

All routes use `/api/v1`, cookie sessions and `X-HRMS-Request: 1` for mutations.
Existing `/leave/types` and `/leave/policies` routes remain available to `leave.manage`.

| Method | Route                               | Purpose                                    |
| ------ | ----------------------------------- | ------------------------------------------ |
| GET    | `/leave/me?year=2026`               | Own balances and assignments               |
| GET    | `/leave/people`                     | Scoped paginated employee selector         |
| GET    | `/leave/employees/:id?year=2026`    | Permitted employee balances                |
| POST   | `/leave/employees/:id/entitlements` | HR annual assignment and credit            |
| POST   | `/leave/balances/:id/adjustments`   | HR idempotent adjustment                   |
| GET    | `/leave/balances/:id/entries`       | Scoped paginated ledger                    |
| POST   | `/leave/preview`                    | Validate and calculate without reservation |
| POST   | `/leave/requests`                   | Submit and reserve                         |
| GET    | `/leave/requests`                   | Paginated mine/review request history      |
| POST   | `/leave/requests/:id/review`        | Approve or reject                          |
| POST   | `/leave/requests/:id/cancel`        | Authorized cancellation                    |
| GET    | `/leave/calendar?month=2026-10`     | Private scoped availability                |

The API implementation stays in `apps/api/src/modules/leave`: access, balances,
requests, read queries, calculations and settings are separate services. Its
read-only attendance interface is exported without a circular module dependency.
Angular models, API client, forms, pages and tests stay in
`apps/web/src/app/features/leave`.

## Verification and limits

The shared [Postman collection](../postman/README.md) includes **10 — Leave
management**. Review the year/credit in the entitlement body and date variables;
use separate employee and reviewer sessions. Setup captures `leave_balance_id`,
submission captures `leave_request_id`.

```powershell
npm.cmd run leave:test
npm.cmd run attendance:test
npm.cmd run db:test
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run lint --workspace=apps/api
npm.cmd run postman:generate
npm.cmd run postman:check
```

Tests use disposable databases. Browser checks use mock data and cover preview,
half-day application, cancellation, HR credit/adjustment/history, review, calendar
privacy and mobile layouts. Optional approved unpaid-leave deductions are now
available in [payroll management](payroll-management.md). Email/in-app notifications,
automated accrual, carry-forward caps and leave exports remain separate work.

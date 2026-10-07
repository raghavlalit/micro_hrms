# Attendance management

Open **Attendance** from the company workspace. Employees record one daily
check-in/check-out and request corrections. Managers review direct reports;
HR/company administrators can review company attendance and make audited adjustments.

## Setup and daily workflow

1. Link the employee to their company user and assign a work schedule in Employee
   Management. Configure the company timezone, working days, start/end times,
   grace minutes and half/full-day thresholds before recording attendance.
2. Prefer an explicit employee schedule. Without one, the API uses an unambiguous
   active location schedule, then an unambiguous active company-wide schedule.
   Missing or ambiguous configuration blocks recording times.
3. Employees open their monthly attendance and use **Check in**, then **Check out**.
   Both use the API server clock, not a client-supplied timestamp. Only active or
   on-notice employees can use these actions.
4. Use **Request correction** for missing or incorrect times. Supply both times
   and a reason. Only one pending request per employee/date is allowed.
5. Managers/HR open **Corrections & approvals** to approve or reject. Nobody can
   review their own request. Approval fails if the underlying attendance changed
   after submission; reject the outdated request and submit a fresh one.
6. HR can **Adjust** a day with a reason: corrected times, absent, leave, holiday
   or weekly off. Nonworking adjustments clear recorded times and worked minutes.
   A manual leave marker does not debit a leave balance or approve a leave request.

## Calculation and safeguards

- Dates use the company timezone. API timestamps require an explicit UTC offset.
  The UI converts company-local clock times regardless of the browser timezone.
  Ambiguous/nonexistent daylight-saving times are rejected by the form; an
  ambiguous real instant can be submitted through the API with its explicit offset.
- Duration is elapsed whole minutes. Full-day and half-day thresholds determine
  present/half-day/absent; lateness beyond the grace period is displayed separately.
- Check-in snapshots schedule, timezone and holiday rules. Later configuration
  changes do not recalculate saved days. Worked holiday/weekly-off days retain
  their calendar classification; overtime and compensatory leave are not calculated.
- Unrecorded days are calendar projections using current assignments: eligible
  past workdays show absent, today/future workdays pending, and holidays/weekends
  their applicable status. These projections do not insert absence records.
- Old check-ins without checkout show incomplete with no invented duration.
  Correct them through regularization; today's checkout cannot close a prior day.
- Future dates, dates outside employment, invalid ordering and overnight pairs
  are rejected. This release supports one pair per day, without breaks or overnight shifts.
- Tenant-scoped TypeORM transactions, PostgreSQL isolation and tenant row locks
  protect writes and concurrent submissions. Managers see direct reports only.
  Existing locked payroll periods block attendance changes. Future payroll locking
  workflows must use the same tenant lock to serialize against attendance writes.
- Attendance changes and correction decisions are audited. Notifications,
  scheduled absence processing, leave balances and payroll calculation are separate topics.

## API and module ownership

All routes are under `/api/v1`; mutations require `X-HRMS-Request: 1` and the
existing cookie session. Platform accounts cannot access tenant attendance.

| Method | Route                                          | Access                                                        |
| ------ | ---------------------------------------------- | ------------------------------------------------------------- |
| GET    | `/attendance/me`                               | `attendance.self`, linked employee                            |
| GET    | `/attendance/people`                           | `attendance.manage` or `attendance.approve.team`, scoped list |
| GET    | `/attendance/employees/:id`                    | Self, company manager or direct-report reviewer               |
| POST   | `/attendance/check-in`                         | `attendance.self`                                             |
| POST   | `/attendance/check-out`                        | `attendance.self`                                             |
| PUT    | `/attendance/employees/:employeeId/days/:date` | `attendance.manage`                                           |
| GET    | `/attendance/regularizations`                  | Own requests or permitted review scope                        |
| POST   | `/attendance/regularizations`                  | `attendance.self`                                             |
| POST   | `/attendance/regularizations/:id/review`       | Company/direct-report reviewer; excludes self                 |

Calendar accepts `month=YYYY-MM`. People and request lists support search and
pagination. Request lists accept `scope=mine|review` and `status=pending|approved|rejected`.

API code lives in `apps/api/src/modules/attendance`: controller/DTO validation,
policy and scope checks, repository queries, calculations, attendance operations
and correction operations are separated. Angular screens, dialogs, models, API
client and tests live in `apps/web/src/app/features/attendance`.

The existing `attendance` and `attendance_regularizations` tables are reused;
no additional migration or seed data is required. Normal environment migration
commands remain documented in [database setup](database-setup.md).

## Postman and verification

Use **09 — Attendance** in the [shared collection](../postman/README.md).
Set `employee_id`, `attendance_month`, `attendance_date`, `attendance_check_in`
and `attendance_check_out` for your test employee. Submission captures
`regularization_id`. Log in separately as the employee and eligible reviewer.

```powershell
npm.cmd run attendance:test
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run lint --workspace=apps/api
npm.cmd run postman:generate
npm.cmd run postman:check
npm.cmd run db:smoke
```

Integration tests use disposable PostgreSQL databases and cover isolation,
concurrent check-ins/approvals, historical snapshots, thresholds, missing
checkouts, stale corrections, date validation, payroll locks and auditing.
Frontend tests cover timezone conversion, daylight-saving boundaries and form
errors. Browser checks cover employee/HR workflows and mobile layouts using
mock data; they do not insert demonstration attendance into the development DB.

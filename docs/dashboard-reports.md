# Dashboard and reports

The company landing page (`/company/overview`) is now a live dashboard. The
previous module shortcuts remain at `/company/setup`. Reports are at `/reports`.
The Angular Material screens have loading, empty, retry/error and mobile states.

## Dashboard

`GET /api/v1/dashboard` requires a tenant session. Each widget independently uses
the corresponding domain permission; a reporting permission is not required.

- Workforce: non-archived profiles; active includes `active` and `on_notice`.
- Attendance: company, direct team or self according to attendance permission.
  Statuses use the existing attendance calendar, including schedule, holiday and
  approved leave snapshots. Present is the calendar status; checked-in includes
  employees still working. Missing attendance today is **pending**, not absent.
  Half-day leave and checked-in counts can overlap; these are not additive totals.
- Pending leave and attendance approvals: the corresponding review scope,
  excluding the current user's requests. Links open the existing review screens.
- Holidays: today through the next 30 days, including year boundaries, up to 10
  entries. Company managers see all locations; others see their applicable calendar.
- Milestones: HR (`employees.manage`) sees up to 20 birthdays/work anniversaries
  in the next 30 days for active/on-notice employees. Birth years/ages are omitted.
  Feb 29 events appear only when that date exists. Joining-day is not an anniversary.
- Payroll status: six recent runs, only with `payroll.manage`.
- Personal leave balances: January–December, with `leave.self` and a linked profile.
- Three latest published personal payslips: `payslips.read.self`.

An unlinked employee account gets empty self data and a profile-linking message.
Live attendance calculations are bounded to 500 employees in the authorized
scope. Above that, the widget explicitly reports that it is unavailable and
directs the user to filtered attendance reports; it never displays partial totals.
Other dashboard widgets remain available.

## Report permissions

Both a reporting permission **and** domain permission are required. Custom roles
cannot gain access to payroll or wider employee data from reporting access alone.
Team means current **direct reports**, not the entire reporting hierarchy.

| Report | Company scope | Direct-team scope |
| --- | --- | --- |
| Employee directory | `reports.read.company` + `employees.manage` | report team/company + `employees.read.team` |
| Attendance | `reports.read.company` + `attendance.manage` | report team/company + `attendance.approve.team` |
| Leave requests / balances | `reports.read.company` + `leave.manage` | report team/company + `leave.approve.team` |
| Payroll summary / components | `reports.read.company` + `payroll.manage` | Not available |

Employees continue to use their self-service screens. They do not receive report
access from self-service permissions. All queries run in tenant transactions with
PostgreSQL RLS, explicit tenant joins and field allowlists. No bank information,
government identifiers, birth dates, leave reasons or review comments are exported.

## Endpoints and filters

| Method and path under `/api/v1` | Purpose |
| --- | --- |
| `GET /reports/options?kind=attendance` | Scope, permitted reports, scoped department/location options and payroll runs |
| `GET /reports/:kind` | Paginated preview with columns, total, applied filters and generation time |
| `POST /reports/:kind/export` | Audited CSV attachment; JSON filter body and `X-HRMS-Request: 1` required |

Kinds: `employees`, `attendance`, `leave`, `balances`, `payroll`, `components`.

All support `search` (name/code), `employee_id`, `department_id`, `location_id`.
Preview accepts `page` (default 1), `limit` (default 20, maximum 100).

| Kind | Additional filters and semantics |
| --- | --- |
| employees | Optional employment `status`; current organization and manager labels |
| attendance | `from` / `to`, inclusive, at most 31 days; default month-to-date; optional attendance `status`; UTC punch times, worked minutes, leave units and projection flag |
| leave | `from` / `to`, at most 366 days; default month-to-date; optional request `status`; overlapping requests show their **whole request units**, not clipped units |
| balances | `year`, default current company year; January–December credited, adjusted, used, pending and available units |
| payroll | Required `run_id`; gross/deductions/net from the run's current calculation version |
| components | Required `run_id`; one row per current calculation component, including manual components without private adjustment reasons |

Date, year and payroll-run filters are rejected for unrelated report kinds.
Invalid statuses, dates and ranges return 400. Missing/inaccessible payroll runs
return 404. Unauthorized report access returns 403.

Employee/attendance/leave reports exclude archived employee profiles. Payroll
history includes archived profiles and uses snapshotted employee names/codes.
Department, location and search filters use the **current** employee record, not
historical organization assignments. Payroll options include the latest 120 runs;
an older run UUID can be supplied through the API.

## CSV export and size limits

Exports include **all** matching rows, independent of preview pagination. The UI
uses the last applied filters for pagination and downloads. Changing the report
clears prior filters/results; failed reloads remove stale rows.

Preview and synchronous export are limited to 5,000 rows. Attendance limits the potential
employee × day rows before calendar calculation, even when a status filter might
reduce the result. HTTP 413 asks the user to narrow the employee/organization/date
filters or use **Queue CSV export**. Background exports support 100,000 rows and
50 MiB; follow progress in **My exports** and download within 24 hours. There is
no silent truncation. See [background jobs](background-jobs.md) for worker setup,
current-access checks, retries and cleanup.

CSV is UTF-8 with a BOM, CRLF lines and quoted/escaped cells. Potential spreadsheet
formulas in text cells receive an apostrophe prefix. Money remains a decimal
string; numeric columns preserve negative amounts and cents. Spreadsheet software
may still reinterpret identifiers/dates or round large numbers when opening CSV;
import those columns as text when exact formatting is needed.

Exports record `report.exported` in `audit_logs`, including actor, tenant, kind,
scope, row count and date/year/run filters. Preview is read-only. The audit records
generation, not proof that a client saved the file. Responses are `no-store`.

These are live operational views. Separate previews/exports and dashboard widgets
can reflect intervening updates; they are not one immutable point-in-time snapshot.
Unlocked payroll can change; locked payroll values retain their existing protections.
XLSX/PDF reports and scheduled delivery remain future work.

## Setup and verification

Existing reporting permissions were already seeded. Background exports require
the background-jobs migration, Redis and the separate generation worker; see
[setup commands](background-jobs.md). Synchronous reporting needs no worker.

```powershell
npm.cmd run reports:test
npm.cmd test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run postman:generate
npm.cmd run postman:check
```

`reports:test` starts a temporary API against a random disposable local PostgreSQL
database, applies migrations, tests multiple tenants and roles, then closes the API
and drops the test database. It does not write company data into the development DB.
Use folder **13 Dashboard and reports** in the shared Postman collection for manual
testing; see [Postman instructions](../postman/README.md).

Ownership: API `modules/dashboard` and `modules/reports`; web `features/dashboard`
and `features/reports`. Reports use a deliberately designed TypeORM read model;
attendance, leave balances and payslips reuse exported domain services.

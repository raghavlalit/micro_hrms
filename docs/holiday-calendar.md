# Holiday calendar

The Holiday Calendar now replaces the generic holiday master editor at
`/holidays`. Company users can open it from the sidebar or workspace overview.
No holidays are assumed or automatically imported during company onboarding.

## Screens and access

- **Month view:** Monday-first calendar with company-wide and location holiday
  labels, today's date highlighted, and a readable list of that month's holidays.
  The grid scrolls horizontally on narrow screens; the list remains available.
- **Annual list:** all applicable entries in the selected year, with date,
  description and location. The supported year range is 1900–2200.
- **Coming up:** the next five entries in the selected year, including today.
  Counts represent distinct dates, not the number of location entries.
- Users with `company.manage` can add/edit holidays and filter all locations,
  company-wide only, a selected location plus company holidays, or their own
  applicable holidays. The existing HR default includes this permission.
- Other active tenant users, including managers, see only company-wide holidays
  plus holidays for their linked employee's current location. They cannot supply
  another location, list all records or write holidays.
- Users without a linked employee or without an assigned location receive only
  company-wide holidays, with an explanatory message. No employee self permission
  is required for this basic calendar access. Platform accounts are excluded.

The employee view uses the **current** employee location, including when viewing
an earlier year. It is not a history of location transfers. Archived locations
remain visible for historical review and existing assignments; they cannot be
newly assigned when creating or changing a holiday's location.

## Date and duplicate rules

Dates are strict ISO `YYYY-MM-DD` business dates, stored as PostgreSQL `date` and
returned without timestamp conversion. The API computes today and the default
year using the company timezone. Angular formats business dates in UTC so the
user's device timezone cannot move a holiday to the previous day.

New and updated holidays must satisfy these rules:

1. A company-wide holiday cannot share its date with any other holiday in that
   company, because it already applies to all locations.
2. A local holiday cannot share its date with a company-wide holiday or another
   holiday for the same location.
3. Different locations may each have a holiday on the same date.
4. Location IDs must belong to the current tenant. Names cannot be whitespace-only.

Create/update takes the tenant row lock before checking conflicts, so simultaneous
company-wide and local writes cannot bypass these rules. Existing unique indexes
also protect duplicate company-wide and same-location dates. A rejected edit
leaves the original record intact. Updates record safe before/after values in
the audit log, and creation records the resulting values.

Historical data may already contain company-wide/local overlaps allowed by the
earlier master editor. Those rows are preserved and displayed, but applicable
dates are deduplicated for counts and downstream calculations. No migration or
silent rewrite of existing data is performed. There is no deletion/archive API
for holidays in this release; edit corrections are audited.

## Attendance and leave integration

`HolidayService.applicableDates(manager, tenantId, locationId, from, to)` is
exported by `HolidaysModule` and used by attendance; leave integration is pending. Call it with
an already authenticated, tenant-scoped transaction manager and validated date
range. The range is inclusive and returns a `Set<string>` of company-wide dates
plus the supplied location's dates. A null location includes company-wide only.

This helper supplies holiday applicability only. Working days, weekend handling,
leave policy exclusions, attendance classifications and balance calculations
remain responsibilities of the modules that consume it. They must preserve
their historical calculation inputs and avoid silently changing locked results
when a holiday or employee location changes. Attendance snapshots these inputs
for saved days and uses current applicability for unrecorded calendar days.
Holiday edits do not recalculate saved attendance. Leave calculations are pending.

## API and code

All routes use `/api/v1`. Mutations require the existing CSRF header.

| Method | Route                | Access / result                                                                             |
| ------ | -------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/holidays/calendar` | Any tenant account; scoped annual calendar, locations for admins, timezone/today and counts |
| GET    | `/holidays`          | `company.manage`; existing all-year array contract                                          |
| POST   | `/holidays`          | `company.manage`; create with conflict and location checks                                  |
| PUT    | `/holidays/:id`      | `company.manage`; audited update                                                            |

Calendar query parameters:

- `year`: optional integer 1900–2200; defaults to company-timezone current year.
- `scope`: `all`, `company`, `location`, or `mine`; defaults to `all` for admins
  and `mine` for everyone else. Non-admins may only request `mine`.
- `location_id`: required only for admin `scope=location`; rejected otherwise.

API implementation lives in `apps/api/src/modules/holidays`, using TypeORM
repositories and QueryBuilder within the shared tenant transaction boundary.
UI, models, reactive forms and tests live in
`apps/web/src/app/features/holidays`. No new dependencies or migrations are needed.

The shared [Postman collection](../postman/README.md) now has **08 — Holiday
calendar**, including self, company, all-location and selected-location calendar
requests plus create/update examples. Set `holiday_year` and the applicable IDs.

## Verification

```powershell
npm.cmd run holidays:test
npm.cmd run onboarding:test
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run lint --workspace=apps/api
npm.cmd run postman:generate
npm.cmd run postman:check
```

Integration tests run against disposable local PostgreSQL databases. They cover
tenant/resource isolation, strict dates, archived locations, concurrency,
duplicate dates, safe updates/audits, timezone boundaries and deduplicated
attendance/leave input. Browser checks use sample data and exercise monthly and
annual views, filters, form validation, conflict feedback, employee restrictions,
empty states and mobile layouts. No sample holidays are inserted into the
development database.

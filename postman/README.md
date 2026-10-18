# Micro HRMS Postman collection

Import these two files into Postman:

- `MicroHRMS.postman_collection.json`
- `MicroHRMS.local.postman_environment.json`

Select **Micro HRMS — Local template** as the active environment. Set passwords
locally; the checked-in template contains no passwords, tokens or real employee
data. Duplicate the environment for UAT/production and change `base_url` to the
API URL ending in `/api/v1` with **no trailing slash**. Production requires HTTPS.
Use Postman's desktop application or desktop agent for localhost requests.

## Start testing

### Employee leave assignments

The Leave management folder includes the paginated assignment directory and
department/location options. Use a user with `leave.manage`. Directory statuses
are `assigned`, `partial`, `unassigned` and `not_applicable`; summary counts ignore
only the status filter. Policies accept optional `applicability.department_id`
and `applicability.location_id` (UUID or null); absent scope applies company-wide.

Send **Preview bulk leave assignment**, review its counts and employee rows, then
**Confirm bulk leave assignment**. Preview alone grants no leave. The example
selects one employee; for all matching pages set `all_matching=true`, remove
`employee_ids` and supply directory `filters`. Use matching numeric years and
zero carry-forward. Each policy is a separate batch, capped at 10,000 employees.
Use a new `leave_assignment_operation_id` for changed input or a fresh preview.
The saved `leave_assignment_job_id` drives confirmation, progress and retry.
Previews expire in 30 minutes. Run `npm.cmd run jobs:worker` to process confirmed
jobs. Existing balances are skipped; retries preserve completed employee outcomes.
Progress/preview rows are paginated at 50 per page and restricted to the requester.
See [the assignment guide](../docs/leave-assignments.md) for behavior and setup.

### General API setup

1. For API-only testing, run `npm.cmd run db:up` and `npm.cmd run dev:api` from the
   project root. No frontend server is required.
2. Set `platform_password` and send **Login — platform administrator**. The
   platform email defaults to `microhrms@yopmail.com`. If a temporary password
   must be changed, set `current_password` and `new_password`, send **Change
   current password**, update `platform_password`, and log in again.
3. For a **new test company**, set a unique `company_slug`, `company_name` and
   `tenant_email`, then send **Create company and initial administrator**. This
   saves `tenant_id` and `activation_token`. Set `activation_password` (at least
   15 characters), activate, and set `tenant_password` to that same password.
   For an existing company, skip creation and activation; enter its slug and
   existing administrator credentials instead.
4. Send **Login — company user**. The slug identifies the company; it is not a
   tenant UUID. Send **Current session** to confirm the identity and permissions.
5. Send requests in the desired module. For user management, send **Roles and
   permission catalog** first to populate the built-in role IDs. Create requests
   save the newly created target IDs. To work with an existing record, choose its
   ID from the appropriate list and enter it in the environment manually.

Postman uses its cookie jar for the HttpOnly session cookie. Leave cookies enabled.
The web calendar controls continue to submit date-only fields as `YYYY-MM-DD`
strings (optional empty fields use their existing null/omitted conventions).
Postman date examples and API request contracts are unchanged.
No bearer token or manual Cookie header is needed. A login replaces the current
identity for that API host: platform and tenant accounts are separate. Use
**Current session** when switching accounts. Logging out, changing a password,
disabling an account or changing roles can invalidate sessions; log in again.
Every mutation automatically adds `X-HRMS-Request: 1`. Do not add an unrelated
Origin header: if supplied, it must match the API's allowed origins.

## Variables and sequencing

- `base_url`: defaults to `http://localhost:3000/api/v1`.
- `tenant_email` / `tenant_password`: the company account used for management.
- `employee_email` / `activation_password`: used by the employee login example.
- `activation_token`: overwritten by the latest successful company, user or
  employee invitation. Only activate the intended latest invitation. Successful
  activation clears the token variable; it does not establish a login session.
- `user_id`: target of user changes, populated only by standalone user creation.
  `current_user_id` is separate, so logging in does not select yourself as target.
- `employee_id`, master IDs and `custom_role_id`: populated by their create
  requests. Master list requests never automatically select an existing record
  for modification. Organization assignment fields in employee bodies default
  to null; enter same-company IDs from lookups to assign them.
- `company_admin_role_id`, `hr_role_id`, `manager_role_id`, `employee_role_id`:
  populated by **Roles and permission catalog**. Reload after switching companies.
- Search and optional filters are in the Params tab, disabled by default.
- `lifecycle_date`: review before status changes. Dates must respect joining date,
  notice date and today's date in the company timezone. Status changes are immediate.
- Use unique sample codes/emails for repeated create requests. Conflicts are
  expected when a unique value already exists. Example dates are editable.

This collection is an **interactive API reference**, not an unattended end-to-end
runner. Do not run the whole collection blindly: it includes password changes,
logout, disable and termination requests, with different required identities and
prerequisites. PUT profile/settings examples send complete sample fields; review
the body before using existing data. An empty protected-data array clears that
category. Use a separate test company for mutation testing.

Response tests check successful status codes. Expected rejection tests (for
example cross-tenant access) will show a failed success assertion; inspect the
actual HTTP error. Existing automated integration tests cover negative cases.

## Current coverage

Authentication; platform company onboarding; company settings; organization
masters; leave types/policies; salary components; document categories; holiday
calendar (company-wide, location and employee scopes); employee management/self-service/protected data; users and roles.

**08 — Holiday calendar** includes the annual/upcoming calendar and holiday
record create/update requests. Set `holiday_year`; employees use the **My
applicable holiday calendar** request. Administrator location filters require a
same-company `location_id`. Upcoming dates use the company timezone. New writes
reject company-wide/location overlaps; historical overlaps count only once.

**09 — Attendance** covers monthly self/team calendars, scoped employee lists,
check-in/out, correction submissions and reviews, and HR adjustments. Set
`attendance_month`, `attendance_date`, `attendance_check_in` and
`attendance_check_out`; timestamp examples require explicit offsets. Select the
intended `employee_id`. Correction creation captures `regularization_id`.
Use employee and reviewer logins separately; reviewers cannot approve themselves.
See [attendance setup and rules](../docs/attendance-management.md).

**10 — Leave management** covers annual entitlement assignment, balances and
ledger entries, audited adjustments, application preview/submission, request
history, reviews, cancellation and the private team calendar. Set `leave_year`,
`leave_month`, `leave_start_date` and `leave_end_date`. Review the numeric year and
credit in the entitlement body. Setup captures `leave_balance_id`; submission
captures `leave_request_id`. Use a new `leave_adjustment_operation_id` UUID for
each new adjustment and keep it unchanged for retries. See [leave setup and
rules](../docs/leave-management.md).

**11 — Payroll and payslips** covers company settings, salary revisions, monthly
runs, calculations, manual adjustments, review, locking, publication and private
PDF downloads. Set `payroll_month`, `payroll_pay_date` and `salary_effective_date`.
Refresh **Run detail** before mutations to capture `payroll_revision_id` and
`payroll_calculation_version`. Select `payroll_employee_id` from the run's items;
this differs from the employee profile ID. Use a fresh
`payroll_adjustment_operation_id` UUID for each adjustment and retain it for retries.
Set `payslip_id` from the employee's published list (or the published payroll item).
Use a completed month for locking. Publish returns **202** and queues generation;
run `npm.cmd run jobs:worker`, then poll **Payslip generation status** until completed.
Only then are PDFs available. See [payroll setup and rules](../docs/payroll-management.md).

**12 — Document management** covers private multipart uploads, metadata, versions,
archive actions, expiry filters and authenticated downloads. Select the employee
and category, then choose a local file in **Body > form-data > file**. Leave
Content-Type unset so Postman supplies its boundary. Accepted: PDF/PNG/JPEG, up to
10 MiB. Use a new `document_upload_operation_id` per document and a new
`document_version_operation_id` per replacement; retain them for identical retries.
Creation captures `document_id`; detail captures `document_revision_id`. Refresh
detail before mutations and select `document_version_id` explicitly from history.
See [document access and storage setup](../docs/document-management.md).

**13 — Dashboard and reports** covers the scoped dashboard, report filter options,
paginated previews and audited CSV export. Set `report_kind` to `employees`,
`attendance`, `leave`, `balances`, `payroll` or `components`. The default is
attendance. Preview date filters are disabled so month-to-date works immediately.
Enable `from`/`to` for attendance or leave, `year` for balances, or `run_id` for
payroll/components. Export has an attendance date-range body by default: use `{}`
for employees, `{"year":2026}` for balances, or `{"run_id":"<UUID>"}` for payroll.
Use **Send and Download** for CSV. Reporting and matching domain permissions are
both required; payroll also requires `payroll.manage`. Maximum 5,000 rows; narrow
filters on 413 or choose **Queue large CSV export**. Queued exports allow 100,000
rows/50 MiB and require `jobs:worker`. Keep `report_export_operation_id` unchanged
for identical retries; use a new UUID for a fresh snapshot or changed filters.
Queue captures `report_export_job_id`; poll status, then download within 24 hours.
Failed jobs can be retried; expired files require a new export. Downloads recheck
current permissions/team scope. See [background setup](../docs/background-jobs.md)
and [report definitions and limits](../docs/dashboard-reports.md).

**14 — Notifications and email delivery** covers your inbox, unread count,
read/unread and mark-all-read actions, plus company-admin delivery status and
failed-email retries. Set `notification_id` from your own inbox and
`notification_delivery_id` from the delivery list. Use replacement-invitation
APIs for failed invitations. API-only startup creates alerts/outbox records;
email requires the separate worker and SMTP configuration. See
[local Mailpit and worker setup](../docs/notifications.md).

**15 — Audit logs and activity history** includes the company history, filter
choices and event details. Requires `company.manage`; set `audit_event_id` from
a chosen row. Dates use inclusive UTC days. Optional user/module/action/resource
filters are disabled initially. Raw metadata and confidential snapshots are
excluded. See [audit history](../docs/audit-history.md).

**01 Authentication** also includes company forgot/reset password requests.
Use company code and email, then copy the latest Mailpit/email fragment into
`reset_token` and set `reset_password` locally. No token is returned by the API.
Links expire after 30 minutes and work once; reset revokes existing account
sessions. See [password recovery](../docs/password-recovery.md).

The collection currently has 146 requests covering all 131 controller routes;
79 request bodies are checked against DTO validation.

Only implemented endpoints are included. Automated accrual, public registration
and platform-admin password recovery are not currently exposed.

Never commit or share exported environments containing real passwords, cookies,
activation tokens or protected employee values. The repository environment file
is always a clean template; maintain local environment values in Postman.

## Required maintenance after every topic

Leave-policy `annual_entitlement` is a JSON number (for example `18` or `18.5`),
not quoted text. The API accepts 0–366 days with at most two decimal places.
The web master editor converts numeric inputs and database decimal strings to
numbers for both creation and updates; an empty required field is not zero.

Company onboarding and Company Admin invitations/role assignments now ensure a
linked employee profile. Use the role catalog's `company_admin_role_id` when
inviting an administrator. Review the profile in Employees after activation;
the account and employee each count towards their respective plan limits.
See [profile defaults and existing-account repair](../docs/admin-employee-profiles.md).

1. Update the relevant group in `scripts/generate-postman.cjs` for every new or
   changed API: method/path, full valid DTO body, variables, permission notes,
   expected response and useful ID capture scripts.
2. Run `npm.cmd run postman:generate` to update the same collection and clean
   environment template. Do not create a disconnected collection for each module.
3. Run `npm.cmd run postman:check`. It compares the JSON with its source, checks
   implemented controller route coverage, compiles Postman scripts, validates
   variables and validates example bodies against compiled API DTOs, offline.
4. Update this coverage list and the feature documentation. Review any new
   mutation prerequisites and session effects. Re-import the updated collection
   in Postman while keeping your local environment values.

The offline check does not call APIs or prove business workflows; the feature's
integration tests remain required. It currently discovers literal NestJS
controller route decorators; extend it if route conventions change.

Attendance employee lookup includes active_only=true for the active employee directory; set false to include other non-archived statuses. Search supports full names and employee codes; page/limit are applied on the server.

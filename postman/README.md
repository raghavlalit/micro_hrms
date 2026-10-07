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

Only implemented endpoints are included. Leave requests,
payroll runs, document uploads, reports, public registration and forgot/reset
password routes are not currently exposed and are not fabricated here.

Never commit or share exported environments containing real passwords, cookies,
activation tokens or protected employee values. The repository environment file
is always a clean template; maintain local environment values in Postman.

## Required maintenance after every topic

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

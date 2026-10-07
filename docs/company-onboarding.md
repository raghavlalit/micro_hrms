# Company onboarding and tenant setup

Implemented 6 October 2026. This guide supersedes the earlier Word documents'
statements that onboarding and company settings are not implemented.

## Try the workflow

Run these from the repository root (use `npm.cmd` in Windows PowerShell):

```text
npm run db:up
npm run db:migrate
npm run dev:api
```

In a second terminal run `npm run dev:web`, then open http://localhost:4200.
Sign in as your existing platform administrator. If its password is temporary,
complete the password change first. Choose **Open company dashboard**.

1. Enter the company profile, lowercase unique company code and first admin's
   name/email. The initial plan is the existing Trial plan. Limits are read from
   that plan, not supplied by the browser.
2. Create the company. Company, defaults, invited administrator, role assignment,
   activation-token hash and audit entry are saved in one transaction.
3. Copy the activation link shown once and share it securely with that admin.
   No email is sent. Links expire after 24 hours. The secret is in the URL fragment,
   not its query string; the activation page clears the fragment immediately.
4. The admin opens the link and sets a 15–128 character password. The invitation
   can be consumed only once. Activation does not automatically create a session.
5. The admin signs in as **Company user**, supplying the company code, email and
   new password. Select **Open company settings** to review the profile and masters.

If the link expires or the creation response is lost, locate the company in the
platform directory and choose **Replace pending link**. That invalidates earlier
links. Replacement is rejected once the administrator is active or disabled;
this action is not a password-reset or account-takeover mechanism.

Duplicate company codes return HTTP 409, including concurrent requests. Retrying
creation never overwrites a company or reapplies its defaults. No separate
idempotency-key replay mechanism is implemented.

## What is initialized

- Four roles and their existing global permission mappings.
- Ten departments and twelve designations.
- Head Office and the default work schedule.
- Four leave types, seven salary components and eight document categories.
- One invited company administrator assigned the company-admin role.

The onboarding template remains in
`apps/api/src/modules/tenants/seeds/master-data.seed.ts`. Companies receive their
own copies. Editing a company's records or changing the template does not alter
another company's records. No employees, salary amounts or leave balances are
created. Holidays and leave policies deliberately start empty.

Trial duration has not been specified: creation records its start time but does
not invent an automatic expiration date. Finalize subscription lifecycle rules
separately. Leave policy configuration does not implement accruals, assignments,
balance crediting or payroll calculations.

## APIs

All paths are prefixed with `/api/v1`. Mutations require the existing session
cookie and `X-HRMS-Request: 1`; Origin checks continue to apply. Activation is
public but requires the one-time token, CSRF header and rate-limit checks.

| Method/path | Access and behavior |
|---|---|
| GET `/platform/companies?page=1&limit=20&search=acme` | Platform admin; limit 1–100; company directory only |
| POST `/platform/companies` | Platform admin; creates company and defaults atomically |
| POST `/platform/companies/:id/admin-invitation` | Platform admin; replaces the pending initial-admin invitation |
| POST `/auth/activate` | `{ "token": "...", "password": "..." }` |
| GET `/company/settings` | Company user with `company.manage` |
| PUT `/company/settings` | Full editable company profile; company code, subscription limits and onboarding metadata are protected |

Example creation body (replace example values):

```json
{
  "name": "Example Company",
  "slug": "example-company",
  "timezone": "Asia/Kolkata",
  "currency": "INR",
  "date_format": "dd/MM/yyyy",
  "contact_email": "contact@example.com",
  "contact_phone": "",
  "address": { "city": "Pune", "country": "India" },
  "admin_email": "admin@example.com",
  "admin_name": "Company Administrator"
}
```

The following master endpoints support GET (list), POST (create), and PUT `/:id`
(update using the full editable record). They derive tenant identity from the
authenticated session. Request bodies cannot override tenant IDs or system fields.

| Endpoint | Required permission |
|---|---|
| `/organization/departments`, `/organization/designations` | `company.manage` |
| `/organization/locations`, `/organization/work-schedules` | `company.manage` |
| `/holidays` | `company.manage` |
| `/leave/types`, `/leave/policies` | `leave.manage` |
| `/payroll/components` | `payroll.manage` |
| `/documents/categories` | `documents.manage` |

Work-schedule days use 0=Sunday through 6=Saturday. Leave policies and holidays
use YYYY-MM-DD dates. Foreign keys must point to records in the same company.
Settings changes create tenant audit records. Deletion, role editing, targeted
leave-policy applicability and full audit-reporting UI are outside this milestone.

## Code organization

- `modules/platform`: catalog controller/service and platform database scope.
- `modules/tenants`: onboarding orchestration, defaults, profile settings and
  transaction-scoped tenant master persistence.
- `modules/users`: creation of the initial invited administrator and role assignment.
- `modules/auth`: invitation generation/consumption, activation, login and guards.
- `modules/organization`, `leave`, `payroll`, `documents`, `holidays`: their own
  master-data controllers and validated DTOs.
- Angular `features/platform`, `company`, `auth`, and the matching domain folders:
  screens/routes; `shared` holds reusable form presentation only.

Repositories/QueryBuilder perform application CRUD. Raw SQL remains limited to
migration DDL and transaction-local PostgreSQL security primitives. The API still
uses its non-owner runtime database role; it never runs company onboarding with
migration credentials or BYPASSRLS.

Migration `CompanyOnboarding1791260000000` adds no tables. It permits company
catalog reads and inserts only in a transaction with a verified, unexpired platform
session. It does not grant platform scope access to tenant HR tables. Tenant
profile updates have column-limited grants. There are still 42 application tables
and 37 tenant RLS tables; there are now five migrations.

## Verification

```text
npm run onboarding:test
npm run auth:test
npm run db:test
npm run db:smoke
npm run build
npm run lint --workspace=apps/api
npm run test --workspace=apps/web -- --watch=false
```

Integration tests create randomly named local databases and remove those databases
afterwards. They cover complete defaults, rollback after partial work, concurrent
duplicate creation/activation, replacement and expired links, permissions, company
settings, cross-company IDs, forged tenant fields and connection-pool isolation.
They do not create demo companies in the development database.

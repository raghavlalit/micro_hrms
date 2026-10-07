# Employee management

The employee module implements the core EMP-001 through EMP-008 and EMP-010
workflows from the Phase 1 requirements. It includes employee profiles, reporting
relationships, lifecycle changes, invitations, protected bank/statutory fields,
and self/direct-report access. Optional CSV import (EMP-009) remains a separate P1
task. Attendance, leave assignments, salary structures and document uploads belong
to their respective future modules.

## Using the screens

1. Sign in as a company administrator or HR user. Platform administrators do not
   access employee records.
2. Open **Employees** and choose **Add employee**. Enter the unique company employee
   code, name, joining date, employment type and any available organization,
   personal or emergency-contact details.
3. Save the employee. New profiles start as **Invited**; creating a profile alone
   does not create a login account or send an email.
4. Open the profile and choose **Invite employee**. A work email is required. Choose
   Employee or Manager access and share the returned activation link securely.
   The link expires after 24 hours and can be used once. Reissuing it invalidates
   the previous link and preserves the account's existing role.
5. Activation sets the user's password and changes an Invited employee to Active.
   HR can also set employment to Active before creating a login account.
6. Use **Change status** for Active, On Notice, Inactive or Terminated changes.
   A reason is mandatory. Notice/termination dates are required where applicable.
7. Open **View protected details** to read or edit bank metadata and statutory
   identifiers. These values are hidden until explicitly requested.

The directory supports server-side pagination and filters for name/code/email,
department, designation, location, manager and status. Archived organization
records cannot be newly assigned. Existing assignments remain visible in history.
Manager chains cannot contain cycles, including concurrent changes.

## Access rules

| User | Access |
| --- | --- |
| Company Admin / HR with `employees.manage` | All company employee profiles, protected fields, updates, status and invitations |
| Manager with `employees.read.team` | Direct reports' work and organization details only |
| Employee with `employees.read.self` | Own full profile and protected fields; may update phone, address and emergency contact only |
| Platform Admin | No employee API access |

Direct reports are the initial manager scope; indirect descendants are not included.
Managers cannot view a report's DOB, home address, emergency contact, bank or tax
identifiers. Self-service does not permit changing name, email, organization,
employment, status or protected values. HR must make those changes.

Invitation email becomes the login email and cannot be changed through profile
editing once linked. Existing company users are not silently linked to new
employee records. Invitations support Employee and Manager roles; assigning HR or
Company Admin belongs to the separate user/role management workflow.

Status changes take effect immediately; future scheduled exits are not implemented.
Inactivation/termination disables the linked user, revokes sessions and consumes
outstanding tokens in the same transaction. Historical records are retained.
Current direct reports must be reassigned before disabling their manager.
Reactivation restores an activated user's login eligibility, but revoked sessions
stay revoked. An unactivated user needs a fresh invitation.

Invited, Active and On Notice employees reserve employee-plan capacity. The
`active_employee_count` counter includes Active and On Notice only. Invited and
Active user accounts reserve user-plan capacity. Tenant row locks serialize
employee writes, hierarchy changes, invitation activation and capacity checks.

## Code ownership

- `apps/api/src/modules/employees`: controllers, DTO validation, repository,
  employee workflows, account activation bridge and private-data encryption.
- `apps/api/src/modules/users/employee-user.service.ts`: invited identities,
  default-role assignment, disabling and restoring user access.
- `apps/api/src/modules/auth`: token issuance/activation and session authentication.
- `apps/api/src/database/migrations`: immutable database migrations.
- `apps/web/src/app/features/employees`: routes, API client, typed models, directory,
  profile, edit/contact forms and status/invitation dialogs.
- `apps/web/src/app/layouts`: only the employee navigation entry and active state.

Business queries use TypeORM repositories and QueryBuilder within tenant-scoped
transactions. QueryBuilder SQL expressions handle search and date projections;
handwritten infrastructure SQL is confined to migrations and existing RLS helpers.

## Database and encryption setup

Migration `EmployeeManagement1791350000000` adds the case-insensitive tenant/email
unique index, grants only the employee counter update column and refreshes existing
active counts. It creates no new tables or sample employee records. Existing
duplicate emails within a company must be resolved before applying the unique index.

From the repository root:

```powershell
npm.cmd run db:migrate
npm.cmd run employees:key:setup
```

The key command creates a random 32-byte key in the ignored `apps/api/.env` file
without printing it or overwriting existing key configuration. Restart the API
after configuration changes. Back up the key securely: losing it makes stored
protected values unreadable. No default/fallback key is used.

For UAT/production, generate independent random 32-byte keys in the environment's
secret-management system and inject these API environment variables:

```text
EMPLOYEE_DATA_KEY_VERSION=v1
EMPLOYEE_DATA_KEYS={"v1":"<base64-encoded-32-byte-key>"}
```

Pass these variables explicitly to the API container through the deployment's
secret/environment configuration; a Compose project `.env` alone does not inject
them into containers. Do not commit keys, place them in frontend configuration or
reuse the development key. Run migrations with the migration identity before
starting the API using the restricted runtime identity.

Values use AES-256-GCM with a fresh nonce and authenticated tenant/employee/field
context. PostgreSQL stores ciphertext and a key version only. New writes use the
active version. To rotate, add a new key while retaining old versions, change
`EMPLOYEE_DATA_KEY_VERSION`, and rewrite records through an authorized workflow.
This release does not include an automated bulk re-encryption command. Keep old
keys until all affected records and retained backups no longer require them.

Without valid keys, normal profile management remains available, but private-data
reads and writes fail closed. Audit records capture action, actor, changed fields
and safe employment before/after values; private values and invitation tokens are
not copied into audit metadata.

## API routes

All paths below have the `/api/v1` prefix and require tenant authentication.
Writes also require the existing `X-HRMS-Request: 1` CSRF header.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/employees` | Scoped directory with filters and pagination |
| GET | `/employees/lookups` | HR's available organization and manager choices |
| GET | `/employees/me` | Current user's linked profile |
| PUT | `/employees/me/contact` | Allowed self-service contact fields |
| POST | `/employees` | Create Invited employee profile |
| GET | `/employees/:id` | Authorized profile projection |
| PUT | `/employees/:id` | HR profile update |
| POST | `/employees/:id/status` | Immediate audited lifecycle transition |
| POST | `/employees/:id/invitation` | Create/replace pending activation link |
| GET | `/employees/:id/private` | Explicit audited read for HR/self |
| PUT | `/employees/:id/private` | HR update of protected field arrays |

Protected data uses `bank_details` and `statutory_identifiers` arrays, each containing
up to 20 `{ label, value }` fields. Sending an empty array clears that category.
No hard-delete endpoint is exposed.

## Verification

```powershell
npm.cmd run employees:test
npm.cmd run auth:test
npm.cmd run onboarding:test
npm.cmd run db:test
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run lint --workspace=apps/api
```

Database integration tests create and remove randomly named disposable local
databases. Browser checks use mocked data for create/edit forms, validation,
invitations, lifecycle dialogs, protected fields, role-specific presentation and
mobile layouts. Preview screenshots in `docs/ui-previews` contain sample data only.

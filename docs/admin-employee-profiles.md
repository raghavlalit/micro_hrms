# Company administrators as employees

New-company onboarding, Users & access invitations containing the built-in
`company_admin` role, and assignment of that role to an existing user now ensure
one linked employee profile in the same transaction. Permissions remain on the
original user and its roles; there is no second login or separate employee role.
Platform administrators are not tenant employees.

An existing employee linked to the user is reused. An available, unlinked employee
with the same company/email can also be linked, retaining its code, employment
details and history. Archived or conflicting profiles are rejected instead of
silently restored or reassigned. Retrying does not create duplicate employees.

For a new profile:

- Code: `ADM-` plus the account UUID without hyphens, uppercase. HR may edit it.
- Name: derived from the account display name; a missing surname is `-` for review.
- Joining date: account creation date in the company's timezone, provisional until
  HR confirms the actual employment date.
- Employment type: `Not specified`; no salary, department, manager, location,
  work schedule or leave entitlements are invented.
- Invited account: invited employee; invitation activation activates both.
  An already active account gets an active employee profile.

The employee counts towards plan capacity and headcount. HR must complete its
employment details and salary before including it in applicable payroll periods.
Existing payroll validation still blocks calculation for eligible employees with
missing salary coverage. Removing an admin role does not delete employment history.

## Existing administrator repair

No blanket backfill or schema migration is required. An operator can preview one
named account with runtime database credentials from `apps/api/.env`:

```powershell
npm.cmd run build:api
node apps/api/dist/modules/employees/commands/link-company-admin.js --tenant <company-UUID> --email <admin-email>
```

After reviewing the company/account, repeat with `--apply`. The command requires
an existing Company Admin membership, uses a tenant-scoped transaction and lock,
checks capacity and writes an audit event. It does not reset passwords, create
invitations, change roles or update unrelated employees. Repeating it reuses the
same profile. No migration credentials are needed.

For Alpha Technologies (`alpth-tech`), the requested existing administrator
`microhrms.alpha.admin@yopmail.com` was linked on 10 October 2026. Its provisional
joining date is 9 October 2026, taken from the existing account creation date.

Verification: onboarding, employee and access integration suites cover initial
creation, activation, role promotion, matching-profile reuse, tenant isolation,
headcount and atomic capacity failure. Shared Postman company/user/role request
descriptions document the new behavior; request bodies and routes are unchanged.

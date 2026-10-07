# Users and roles

Company administrators and HR users can open **Administration → Users & access**
and **Roles & permissions**. Both areas require the existing `roles.manage`
permission. Platform administrators cannot use these tenant endpoints.

## User workflows

1. Search the directory by name/email and filter by account status or role.
2. Choose **Invite user** to create a company login with one or more roles.
   Supply the person's name, email and an audit reason. The account reserves a
   user-plan place immediately. Share the returned activation link securely; no
   email is sent until the notification/email provider is implemented.
3. For an existing employee, invite from the employee profile first, then manage
   their roles here. The user screen does not automatically link matching emails
   to employee profiles or create another identity for that employee.
4. **Change roles** replaces the account's role assignments. Permissions are the
   union of its assigned roles. Existing sessions are revoked after a change.
5. **Disable** blocks login and revokes sessions, invitations and reset tokens.
   It does not change employment status, delete history or release employee-plan
   capacity. **Enable** restores an activated account or returns an unactivated
   account to Invited. The latter needs a fresh invitation.
6. **Reissue invite** works only for Invited users. It preserves roles, invalidates
   earlier links and creates a single-use link valid for 24 hours.

Inactive, terminated or archived employees cannot have their login re-enabled
here. Use the employee lifecycle workflow first. Lifecycle activation/reactivation
continues to synchronize login eligibility as documented in employee management.

## Role workflows and safeguards

- View all company roles, assigned-user counts and permission descriptions.
- Company Admin, HR, Manager and Employee are read-only built-in roles. Existing
  onboarding defaults are preserved; notably HR currently has the same permission
  set as Company Admin. Create a custom role for narrower access.
- Custom roles have an immutable unique code, an editable name and one or more
  permissions from the global catalog. Creating/editing requires an audit reason.
- A role change affects every assigned user and revokes their existing sessions.
  Other assigned roles continue to grant their permissions.
- Administrators can only grant permissions they currently hold and manage users
  or roles whose current permissions are within their own scope. A limited access
  administrator cannot promote themselves or another user to broader access.
- Users cannot change their own role assignments or account status, or edit a
  custom role assigned to themselves. Another authorized administrator must act.
- At least one **active account assigned Company Admin** must remain. An invited
  replacement does not count. This protection also applies when an employee
  lifecycle change disables a linked administrator.
- Tenant row locks serialize invitations, role/status changes and employee
  lifecycle operations, protecting capacity and last-administrator checks under
  concurrent requests. Write permissions are rechecked after acquiring the lock.
- Roles cannot currently be deleted. Remove unwanted role assignments to stop
  granting access. User email/password edits are not exposed by this module;
  passwords remain in authentication's existing activation/reset workflows.

All access changes record the actor, reason and safe before/after metadata in the
existing audit log. Passwords and invitation tokens are never included.

## API and ownership

All paths below start with `/api/v1`. They require a tenant session and
`roles.manage`; mutations also require `X-HRMS-Request: 1`.

| Method | Path                    | Purpose                                                             |
| ------ | ----------------------- | ------------------------------------------------------------------- |
| GET    | `/users`                | Paginated directory; `page`, `limit`, `search`, `status`, `role_id` |
| POST   | `/users`                | Invite a standalone company account                                 |
| PUT    | `/users/:id/roles`      | Replace role assignments                                            |
| PUT    | `/users/:id/status`     | Enable/disable login                                                |
| POST   | `/users/:id/invitation` | Reissue a pending invitation                                        |
| GET    | `/roles`                | Role and permission catalog                                         |
| POST   | `/roles`                | Create a custom role                                                |
| PUT    | `/roles/:id`            | Edit a custom role name and permissions                             |

API code lives in `apps/api/src/modules/users`. TypeORM repositories/QueryBuilder
run inside tenant transactions and PostgreSQL RLS; runtime business queries do
not use raw SQL. `access-safety.ts` is also used by employee account synchronization.
`TenantContextModule` isolates the existing transaction helper from onboarding,
avoiding circular module imports. Invitation token handling remains in Auth.

Angular code lives in `apps/web/src/app/features/users`, with Material controls,
reactive forms, validation and lazy routes at `/administration/users` and
`/administration/roles`. Navigation changes are confined to the existing layout.

No schema migration, new permission seed or development-data insertion is needed.
The module uses the existing users, roles, memberships, permissions, sessions,
tokens and audit tables. No additional dependency was installed in either app.

## Verification

The shared [Postman collection](../postman/README.md) includes all user and role
requests under **07 — Users and roles**, plus authentication and earlier modules.
Run the role catalog request first to populate built-in role IDs.

```powershell
npm.cmd run access:test
npm.cmd run employees:test
npm.cmd run auth:test
npm.cmd run onboarding:test
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run lint --workspace=apps/api
```

Access integration tests use disposable local PostgreSQL databases and exercise
authorization, tenant isolation, validation, invitations, session revocation,
delegated permissions, concurrent capacity and last-administrator protection.
Browser checks use mock data and cover desktop/mobile screens, forms, errors and
route restrictions. Preview images in `docs/ui-previews` contain sample data only.

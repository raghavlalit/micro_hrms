# Authentication and tenant isolation

Code ownership and TypeORM query rules are documented in
[development conventions](development-conventions.md). Authentication persistence
lives in `modules/auth/auth.repository.ts`; platform provisioning lives in
`modules/platform/commands/provision-platform-admin.ts`. The public npm commands
and HTTP endpoints are unchanged.

## Local use

Run `npm run dev:api` and `npm run dev:web` in separate terminals. Open
http://localhost:4200 and select **Platform administrator**. The initial account
is `microhrms@yopmail.com`. Its generated temporary password is in the local,
Git-ignored `.tmp/platform-admin-<UUID>.txt` file created by provisioning.
Change it on first login, then delete that file. No email is sent.

The company-user option requires an activated user and company code. Platform
admins create companies from the company dashboard, then securely share the
one-time activation link. See [company onboarding](company-onboarding.md).
The administrator provisioning command itself does not create a company.

## Provisioning another environment

1. Follow `database-setup.md`, configure the migration connection and run
   `npm run db:migrate` (now five migrations).
2. Set `PLATFORM_ADMIN_EMAIL` and `PLATFORM_ADMIN_PASSWORD` securely for the
   provisioning process, then run `npm run admin:provision`. The password must
   be 15–128 characters. Production requires an explicitly supplied secret.
3. Unset those provisioning variables and start the API using only its restricted
   `DATABASE_URL`. Existing administrators are never overwritten by provisioning.
4. Set `AUTH_ORIGINS` to a comma-separated list of exact HTTPS web origins in
   production, e.g. `https://hrms.example.com`. No trailing slash. Development
   defaults to `http://localhost:4200,http://localhost:3000`.
5. Use the same-origin Angular `/api` proxy or server Nginx proxy. Production
   cookies require HTTPS. CORS is intentionally not enabled.

There is no public administrator-registration API. The API runtime cannot insert,
delete, disable or change the email of platform administrators. It can read
identity credentials and update password/first-login fields for authentication.
Platform administration does not bypass tenant RLS or grant HR-data access.

## HTTP endpoints

All paths are under `/api/v1`. Every POST requires `X-HRMS-Request: 1` and JSON.
If an Origin header is present, it must match `AUTH_ORIGINS`. Browser sessions
use an HttpOnly, SameSite=Strict cookie; production also uses Secure and the
`__Host-` prefix. There are no bearer tokens or localStorage credentials.

| Method/path | Input or behavior |
|---|---|
| POST `/auth/login` | `{ "kind": "platform", "email": "...", "password": "..." }`; tenant login uses `kind: "tenant"` and `company: "company-slug"` |
| POST `/auth/activate` | `{ "token": "...", "password": "..." }`; consumes a pending invitation once, then the user signs in normally |
| GET `/auth/me` | Current identity and live permissions; never password hashes or session secrets |
| POST `/auth/password` | `{ "currentPassword": "...", "newPassword": "..." }`; revokes all sessions |
| POST `/auth/logout` | Revokes current session and clears cookie |
| POST `/auth/logout-all` | Revokes every session for this identity |
| GET `/platform/overview` | Platform-only access check; temporary password must first be changed |
| GET `/company/access` | Tenant-only access check requiring `company.manage` |

Passwords use Node scrypt (N=131072, r=8, p=1), a random 16-byte salt and
constant-time comparison. Login generates a new 32-byte random session secret;
the database stores its SHA-256 digest. Sessions expire after eight hours without
automatic renewal. Password changes revoke all sessions in the same transaction.
Disabled identities and suspended/closed tenants are rejected on every request.

## Adding protected endpoints

The global guard denies routes without an explicit access policy. Use
`@Access('platform', 'platform.access')`, `@Access('tenant', 'employees.manage')`
or `@Access('authenticated')` deliberately. `@Public()` is reserved for genuinely
public routes. `authenticated` routes are also accessible while a temporary
password needs changing, so use that scope only for identity/session operations.

Tenant controllers must use `req.principal.tenantId` after the guard, then
`TenantDatabaseService.withTenant()` for every business query. Never use an
unchecked header/body tenant ID. A company slug is only a login lookup hint;
the password and tenant-specific session must still validate. The fixed SQL
`auth_tenant_id` function reveals only an active tenant's ID by exact slug and
does not grant table access. Its owner must be the trusted migration identity.

Permissions are reloaded on every request. Self/team permissions will additionally
need resource ownership/reporting-scope filters in future business modules;
a permission code by itself is not an employee-row authorization check.

## Operations and current limits

Login rate limits persist in PostgreSQL: 10 attempts per account/company and 100
per client IP in a 15-minute window. Password-change attempts have a separate
identity limit. Four password computations may run concurrently per API process;
excess work gets HTTP 503. The app does not trust forwarded IP headers by default,
so behind Nginx the IP limit is shared by proxied users. Configure a precisely
trusted proxy chain before scaling; do not blindly enable trust proxy.

Periodically delete expired `auth_rate_limits` and expired/revoked sessions with
a trusted maintenance job (tenant sessions require deliberate tenant scope or a
maintenance identity). No scheduler has been implemented in this milestone.

Email verification, forgotten-password email recovery, MFA and authentication
audit-event reporting are not implemented. Do not enable email-based recovery
for a publicly readable mailbox. Use a private, controlled admin email before
production. Swagger is disabled in production.

Verification: `npm run auth:test`, `npm run db:test`, `npm run db:smoke`,
`npm run build`, and `npm run test --workspace=apps/web -- --watch=false`.
Integration tests use randomly named disposable local databases.

Implementation references: [Node crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html),
[OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html),
[OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

The earlier Word guides describe the pre-authentication scaffold. This document
supersedes their authentication, schema-count and public API-access notes:
there are now 42 application tables plus migration history, and 37 RLS tables.

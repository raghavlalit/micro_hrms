# Module ownership and persistence

After completing every topic, update the shared Postman collection and its clean
environment template. Maintain `scripts/generate-postman.cjs`, run
`npm.cmd run postman:generate` and `npm.cmd run postman:check`, and update
`postman/README.md`. This is part of feature completion, alongside API tests.

Feature implementation belongs in its dedicated module. Root files compose the
application; they do not implement feature workflows.

| Location | Responsibility |
|---|---|
| `apps/api/src/modules/auth` | Login, passwords, sessions, guards, auth DTOs and auth persistence |
| `apps/api/src/modules/platform` | Platform administrator schemas, routes and provisioning command |
| `apps/api/src/modules/tenants` | Company routes, tenant lookup and transaction scope, onboarding seed template |
| `apps/api/src/modules/users` | Company user identities, roles and permissions |
| `apps/api/src/modules/audit` | Tenant audit-log schema |
| `apps/api/src/database` | Shared connection configuration, entity registry, schema helpers, role safety check and migrations |
| `apps/web/src/app/features/auth` | Login/session/password screen and its component tests |
| `apps/web/src/app/app.ts` and `app.routes.ts` | Root outlet and lazy feature routing |
| `apps/api/test` | Cross-module HTTP/database integration checks with disposable databases |

Other features continue to use their existing folders (employees, attendance,
leave, payroll, etc.). Platform is a distinct module because platform identities
are not tenant users or audit records.

Use TypeORM repositories for normal CRUD and QueryBuilder for joins, locking,
conditional updates and projections. Pass the transaction's `EntityManager` to
repositories: tenant operations must never fall back to a global repository
outside the tenant transaction. Bind all user values as parameters.

`getRawOne`/`getRawMany` only shape QueryBuilder projection results; they do not
execute handwritten SQL statements. Fixed SQL expressions such as `now()` and
`CASE` remain inside QueryBuilder for database-clock expiry and atomic counters.

Raw `query()` calls are reserved for explicit PostgreSQL infrastructure:

- Migration DDL, grants, policies and triggers.
- Runtime database-role inspection using PostgreSQL system catalogs.
- Transaction-local `set_config` for tenant RLS.
- Transaction-local platform session context and its database validity check,
  limited to company catalog reads and company creation.
- The restricted `auth_tenant_id` security-definer lookup before login.
- The provisioning advisory lock that serializes operator commands.

Integration fixtures and independent database assertions may use raw SQL. Do not
rewrite released migrations to follow current entity code or move them into
feature folders; they are immutable, ordered database history.

The authentication repository's rate limiter inserts a missing counter with
`orIgnore()`, then atomically increments/resets it with QueryBuilder inside one
transaction. It commits before login rejection, so failed attempts are retained.

This refactor changes code ownership only: table names, schema, endpoint URLs,
administrator credentials and existing tenant records are preserved. The web
entry now redirects to `/login` and lazy-loads the auth feature.

# PostgreSQL and TypeORM setup

Micro HRMS uses PostgreSQL 17, TypeORM EntitySchema mappings grouped by domain, and explicit migrations. The API never synchronizes its schema or runs migrations automatically.

## Local database

From `C:\projects\MicroHRMS` in PowerShell:

```powershell
npm.cmd run db:setup
npm.cmd run db:up
npm.cmd run db:migrate
npm.cmd run db:status
npm.cmd run dev:api
```

The first command is one-time only. It generates different random passwords in the ignored root `.env` and `apps/api/.env`, preserving existing API settings. If configuration already exists it refuses to replace it. On this workstation setup has already been performed; use `db:up` and `db:status` to resume.

The database listens on **127.0.0.1:5433**, database **microhrms**. A pre-existing PostgreSQL instance on port 5432 is not modified. Docker stores data in the project-specific `microhrms_postgres_data` volume. `npm.cmd run db:stop` preserves the data. Do not delete the volume as a routine restart step.

For pgAdmin or another database client, use host `127.0.0.1`, port `5433`, database `microhrms`, username `microhrms_migrator`, and the `POSTGRES_PASSWORD` from the root `.env`. If pgAdmin itself runs in Docker on this Windows host, use `host.docker.internal` as the host instead. Migration credentials have full access and are for local administration only.

The runtime account `microhrms_app` can read/write only permitted tables, cannot modify schema, and cannot bypass row-level security. `DATABASE_URL` uses that role; `MIGRATION_DATABASE_URL` uses the migration role. An API startup guard rejects privileged/schema-owner credentials. Never replace the runtime URL with the migration URL to make a query work.

## TypeORM and migration commands

Configuration is shared by NestJS and the CLI in `apps/api/src/database/database.options.ts`. It loads the API `.env` independently of the shell working directory. Production must use validated TLS; a custom CA can be passed through `DATABASE_SSL_CA`.

```powershell
# Apply committed migrations
npm.cmd run db:migrate

# Show applied and pending migrations
npm.cmd run db:status

# After changing domain schema mappings, build and generate a migration
npm.cmd run build:api
npm.cmd run migration:generate --workspace=apps/api -- src/database/migrations/DescribeTheChange

# Verify mappings match the migrated database
npm.cmd run schema:check --workspace=apps/api

# Verify against a disposable, randomly named local PostgreSQL database
npm.cmd run db:test

# Start a temporary API, verify HTTP and restricted credentials, then shut it down
npm.cmd run db:smoke
```

Review generated SQL before applying it. Use `npm.cmd run db:revert` only for a deliberate rollback: reversing the initial schema migration drops application tables and their data. Add a new forward migration after a migration is released; do not edit deployed migrations. TypeORM's schema comparison does not check policies, permissions or trigger bodies, so keep the database integration checks.

The integration command creates and removes only its own `microhrms_test_<random>` database. It verifies fresh apply, repeat apply, security-only rollback/reapply, full rollback/reapply, metadata drift, tenant isolation, foreign keys, monetary precision, audit history and locked payroll. It does not erase the development database.

## Tenant access

Tenant tables have a `tenant_id`, a unique `(tenant_id, id)` key, and composite foreign keys for tenant-owned references. PostgreSQL RLS requires a transaction-local `app.tenant_id`. Unscoped reads return no rows and unscoped writes are denied.

Import `DatabaseModule` into a business module, then use `TenantDatabaseService.withTenant`:

```typescript
return this.tenantDatabase.withTenant(authenticatedUser.tenantId, async (manager) => {
  return manager.getRepository(Employee).find({
    where: { tenant_id: authenticatedUser.tenantId },
  });
});
```

`Employee` is the EntitySchema exported by `modules/employees/employee.schemas.ts`. Use only the supplied transaction manager inside the callback; a separately injected repository uses a different connection without that tenant context. Workers follow the same pattern and validate their trusted tenant/job context.

This helper checks active tenant status, but it is **not authentication or RBAC**. Obtain the tenant ID from verified membership, never directly from a request header, body or URL. Manager/self permissions still belong in guards and services. RLS protects accidental missing predicates, not a compromised shared database credential.

Tenant creation, initial role provisioning, login tenant resolution and internal support authorization require a separately designed, narrow trusted provisioning/authentication workflow. They are not implemented by this schema setup. Do not put migration credentials into ordinary request handlers. Runtime access to `tenants` and `support_access_grants` is read-only; platform identities have no runtime grants.

## Deployment

1. Provision the database and a non-owner login role named `microhrms_app` with NOSUPERUSER, NOCREATEROLE and NOBYPASSRLS.
2. Provision a separate migration role that owns schema objects and can grant permissions to `microhrms_app`. Data migrations touching forced-RLS tables need an explicitly controlled maintenance policy or privileged migration identity.
3. Inject the migration URL only into the deployment migration job. Do not ship it in API or worker environments.
4. Back up the database, build the API, then run `migration:run` once as a release step before starting compatible API/worker containers.
5. Inject the runtime URL and TLS configuration into API/worker containers. Keep `synchronize=false` and `migrationsRun=false`.
6. Configure backups, test restores, and use forward fixes for production schema changes where possible.

The Compose initialization script only runs when the data volume is first created. Changing passwords in `.env` does not rotate existing PostgreSQL role passwords. Perform deliberate role password rotation and update both connection URLs together.

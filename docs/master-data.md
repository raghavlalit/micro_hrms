# Master data lifecycle

## Global data

The `TenantSecurity1791178103171` migration already inserts the 18 permission
definitions and the Trial subscription plan (100 employees / 100 users).
These records are shared across companies. Its inserts use `ON CONFLICT (code)
DO NOTHING`, preserving existing definitions. No extra global seed is needed.

For a new environment, follow `database-setup.md` and run `npm run db:migrate`
from the repository root to apply the schema and its global catalog.

On 5 October 2026, the local database was verified to contain all 18 permissions,
the Trial plan, and zero tenants. No tenant defaults were inserted.

## Company defaults

`apps/api/src/modules/tenants/seeds/master-data.seed.ts` is a data-only onboarding
template, approved as starting defaults. It does not run on application startup
or during migrations. `TenantDefaultsService` now applies it inside the company
creation transaction. See [company onboarding](company-onboarding.md).

The onboarding workflow:

1. Create the company and obtain its tenant ID in a trusted server workflow.
2. Within the same transaction, copy roles, role permissions, departments,
   designations, locations, work schedules, leave types, salary components and
   document categories into that company's tenant-scoped records.
3. Resolve all references within that tenant; reuse global permission IDs.
4. Reject duplicate company codes with HTTP 409. Never rerun defaults, overwrite
   customizations or expand existing role permissions during a retry.
5. Let the company administrator customize their own records. Confirm leave
   policies and holidays separately; the template intentionally leaves them empty.

Later template changes apply to new companies only. Existing companies retain
their settings unless they explicitly choose an update. Tenant IDs must never
be null to represent shared master records.

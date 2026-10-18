# Audit logs and activity history

Open **Administration → Audit history** (`/audit-logs`) as a tenant account with
`company.manage`. The existing Company Admin and HR defaults include that
permission. Platform administrators cannot use these tenant endpoints.

## Using the screen

1. Open the history to see the newest recorded actions, 20 per page.
2. Search by current user name or email, choose a module/action, or select dates.
   Click **Apply filters**. Pagination and Refresh retain the applied filters;
   edits to the controls take effect only when applied. Clear resets them.
3. Dates are inclusive **UTC calendar days**, and timestamps display in UTC.
   For example, October 8 includes 00:00:00 through just before October 9 UTC.
4. Choose **View details** for the actor, timestamp, exact event/resource IDs and
   selected operational details. Close returns to the same filtered page.

Filter choices come only from events recorded for the current company. A module
is the first part of the stored action code: `leave.approved` belongs to `leave`.
Existing `user`, `role`, `company` and `master` action groups retain their names.
No matching activity, loading failures and permission loss have explicit states.

## Coverage and privacy

This feature reads existing `audit_logs`, including historical events from
employees, roles/users, company settings, attendance, leave, payroll, documents,
report exports and email retries. It does not invent missing events or track every
page view/login. Viewing history does not generate recursive audit entries.

Actor names/emails reflect the current account, not an identity snapshot at the
time of the action. Disabled users remain attributable by ID. Events without a
tenant actor display **No tenant actor**. This includes system/platform actions
and public password-reset requests; the UI does not infer an identity from that
absence.

Raw audit metadata can contain confidential business snapshots. The API never
returns it directly. Details permit only validated employee/policy/operation/item/
line UUIDs, nonnegative integer counts/version/year, and the payroll unpaid-leave
setting flag. Unknown keys, nested before/after values, salary amounts, private
reasons/comments, tokens, passwords and request IDs are excluded. This view does
not provide a full before/after comparison. Resource IDs are references, not links
that bypass the destination module's access checks.

All endpoints derive tenant identity from the authenticated session. The service
uses TypeORM QueryBuilder inside the existing tenant/RLS transaction and joins
actor identity on both user ID and tenant ID. Permissions are checked on every
request. There are no write/delete/export endpoints. Existing database append-only
controls remain in effect; this screen is not a tamper-proof external archive.

## API

All paths start with `/api/v1`, require a company session and `company.manage`,
and return `Cache-Control: no-store`.

| Request | Behavior |
| --- | --- |
| `GET /audit-logs` | `{ items, total, page, limit }`, ordered by created time and ID descending |
| `GET /audit-logs/options` | Current company's recorded `actions` and `modules` |
| `GET /audit-logs/:id` | Event identity and selected `details`; missing/foreign IDs return 404 |

List filters are optional and combined with AND:

| Parameter | Rule |
| --- | --- |
| `page`, `limit` | Defaults 1/20; page 1–100000, limit 1–100 |
| `actor` | Literal case-insensitive substring of user name/email, max 100 characters |
| `actor_id`, `entity_id` | Exact UUID; available for targeted API investigations |
| `module`, `action` | Exact module prefix/action code from options |
| `from`, `to` | Real dates in YYYY-MM-DD; inclusive UTC days; reversed ranges rejected |

Unknown query fields, including `tenant_id`, are rejected. Postman folder
**15 Audit logs and activity history** includes all three requests. Set
`audit_event_id` from a chosen list row; optional filters start disabled.

## Setup and verification

No schema change, new environment variable, worker or migration is required.
Deploy the rebuilt API and frontend together with the existing database.

```powershell
npm.cmd run audit:test
npm.cmd run lint --workspace=apps/api
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run postman:check
```

The API test creates/drops a disposable local database and covers authentication,
tenant isolation, permission revocation, date boundaries, filters/pagination,
disabled actors, metadata canaries, and read-only behavior. Angular tests cover
applied-filter state, date validation, stale data clearing and detail-load retries.
Browser checks cover filters, detail dialogs, empty/error states and mobile layout.

Implementation: API `modules/audit`, Angular `features/audit`. Root files only wire
the feature into the application and navigation.

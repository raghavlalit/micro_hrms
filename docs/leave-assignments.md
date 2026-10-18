# Employee leave assignment

Open **Leave management** as a user with `leave.manage` (normally HR or company
administrator). It opens an employee directory. Employees and managers retain
their existing self/team balance screens.

## Directory

- Select the January–December year, search by name/code, and filter by department,
  location, policy and assignment status. Click **Apply filters**.
- Summary cards count the applied filters across all pages, excluding the status
  filter. The table is paginated on the server, with 20, 50 or 100 rows per page.
- Eligible employees are unarchived, active/on notice, with employment dates that
  intersect the year. Inactive, invited and terminated profiles are excluded.
- Fully assigned means every applicable active leave type has a balance for that
  year. Partial means some do; not assigned means none do. A zero or exhausted
  balance still counts as assigned. Multiple policies for the same leave type
  count once. No applicable policy is a separate status.
- Policies optionally restrict department and location (both must match if both
  are set). Empty restrictions apply company-wide. Policy/employment dates must
  overlap within the year. Changing scope does not delete historical balances.
- **Assign leave** shows only unassigned applicable policies. **Balances / adjust**
  opens the existing cards, adjustment and ledger screens for that employee/year.

## Bulk assignment

1. Select employees on one or more pages, or explicitly select all matching
   employees across pages. Applying new filters clears selection. Maximum 10,000
   employees per batch; narrow the filters for larger companies.
2. Click **Assign selected**. Choose one policy, reviewed numeric credit and a
   reason. Repeat for other leave types. Bulk carry-forward is not supported;
   use the individual entitlement screen for reviewed carry-forward transfers.
3. Preview the ready, already-assigned and ineligible counts and employee rows.
   Preview saves a draft only; no leave balance changes. Employee IDs are frozen
   at preview time, and the draft expires after 30 minutes.
4. Confirm. The background worker processes the batch; the page polls progress
   every five seconds. Recent batches and paginated employee outcomes are visible
   to the requester. Processing continues if the browser closes.
5. A failed job can be retried. Completed credits/outcomes remain intact. If the
   policy changed after preview, create a new preview instead. Existing leave
   balances are always skipped, never reset, topped up or overwritten.

Eligibility and requester permission are checked again during execution. Only
employees marked ready in the preview can receive a new credit. New matching
employees after preview do not join the batch. Each employee's credit, assignment,
ledger/audit entries and job outcome commit in the same tenant-locked transaction.
Leases and persisted outcomes allow interrupted work to resume without duplicate
credits. A batch may complete with skipped/ineligible outcomes; inspect its counts.

## Local setup and verification

```powershell
npm.cmd run db:migrate
npm.cmd run notifications:up
npm.cmd run jobs:worker
```

The jobs worker is a separate, long-running process and uses the existing
PostgreSQL/Redis configuration. Run the API and Angular app in their usual terminals.
Restart an already-running API/worker after upgrading. Migration
`1791600000000-LeaveAssignmentJobs` adds `leave_assignment` and `draft` to job checks;
it does not grant leave or change existing balances. Its rollback refuses to remove
support while assignment-job history exists.

```powershell
npm.cmd run leave:test
npm.cmd run db:test
npm.cmd run postman:generate
npm.cmd run postman:check
npm.cmd run test --workspace=apps/web -- --watch=false
```

The leave suite uses a disposable local database and exercises 1,000-employee
pagination and processing, scope, isolation, preview expiry, frozen membership,
existing balance/history preservation and interrupted-worker retry.

All business implementation remains in `modules/leave` and `features/leave`;
the shared worker only dispatches jobs. TypeORM repositories/QueryBuilder run
inside tenant-scoped transactions. See the **Leave management** Postman folder
for all directory, preview, confirm, progress, retry and policy-option requests.

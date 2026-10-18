# Notifications, email and background jobs

Implemented in API `modules/notifications` and Angular `features/notifications`.
Optional modules remain on hold. [Company password recovery](password-recovery.md)
now uses this worker. Public registration, scheduled exports and document-expiry
reminders remain outside this feature.

## What users see

- A notification bell with an unread count, refreshed every 30 seconds.
- `/notifications`: their own alerts, all/read/unread filters, pagination,
  read/unread actions and mark-all-read.
- `/notifications/deliveries`: company administrators (`company.manage`) can
  inspect email status and retry failed workflow messages. They cannot read other
  users' inboxes through the notification API.
- Related-screen links use the existing module permissions. Notifications contain
  generic workflow text, never salary amounts, bank details or request reasons.

| Event | Recipients |
| --- | --- |
| Company/user/employee invitation or replacement | Invited account; email contains its one-time activation link |
| Company password reset requested | Active account; email contains a single-use, 30-minute reset link |
| Leave submitted | Current direct manager with approval permission and active HR/company leave reviewers, excluding the requester |
| Leave approved/rejected/cancelled | Linked employee account |
| Attendance correction submitted | Current authorized direct manager and active company attendance reviewers, excluding the requester |
| Attendance correction approved/rejected | Linked employee account |
| Payslips published | Each linked employee, once per published payslip |

Only events generated after this release create notifications; historical actions
are not replayed. An invited account sees its in-app invitation after activation.
Email workers recheck the current account status, employee link, manager relation
and domain permission before sending. Changed access causes delivery to be skipped.
Existing generic in-app history remains visible only to its original recipient.

## Architecture and failure behavior

1. A domain service records a notification and email outbox intent in its existing
   PostgreSQL transaction. No Redis or SMTP request runs in that transaction.
2. A separate worker polls due outbox references every five seconds and enqueues
   BullMQ jobs containing only `tenantId` and `eventId`.
3. Consumers re-read the event under tenant RLS, validate the recipient, lock the
   delivery row, send through `EmailProvider`, and record the result.
4. SMTP failures are retried with exponential backoff, up to five actual send
   attempts. They never undo the originating approval/publication. Failed workflow
   messages can be retried by company administrators; that action is audited.

The PostgreSQL outbox is durable across Redis outages/restarts. A rolled-back
business action produces no alert. Unique event keys prevent duplicate in-app
notifications. Pending records are rediscovered after lost Redis jobs. The worker
uses three concurrent jobs; scale worker processes separately from HTTP API replicas.

SMTP delivery is **at least once**, not exactly once: a crash after SMTP accepts
but before PostgreSQL commits can cause a duplicate email. A stable Message-ID
helps providers recognize repeats but does not guarantee deduplication. `sent`
means SMTP accepted the message, not that it reached an inbox or was read.

The delivery transaction holds a row lock during a bounded SMTP request. Provider
connection/greeting timeouts are 10 seconds and the socket timeout is 15 seconds.
Redis jobs retain no secrets; provider errors are reduced to fixed error codes.
Notifications remain usable when the SMTP worker is stopped.

## Local setup

From the repository root, with the existing local PostgreSQL setup:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run notifications:setup
npm.cmd run notifications:up
```

`notifications:setup` adds missing values to ignored `apps/api/.env`, generates a
random 32-byte notification encryption key, and preserves existing settings/keys.
It refuses production/non-local database configuration and prints no credentials.
If your file already has `EMAIL_DRIVER=disabled`, change it explicitly to `smtp`.
Restart API/worker processes after changing environment settings.

Start each application in a separate terminal when needed:

```powershell
npm.cmd run dev:api
npm.cmd run dev:web
npm.cmd run notifications:worker
```

- Web: `http://localhost:4200`
- Mailpit test inbox: `http://localhost:8025`
- Local SMTP: `127.0.0.1:1025`
- Local Redis: `127.0.0.1:6380`

Mailpit captures messages locally; it does not deliver them to external inboxes.
All development container ports bind to localhost. Redis uses AOF persistence and
`noeviction`; Mailpit retains at most 500 test messages in its local volume.
Stop the worker with Ctrl+C. Stop only the new infrastructure with:

```powershell
npm.cmd run notifications:stop
```

The worker is deliberately a separate process; starting the API alone does not
start email delivery. `EMAIL_DRIVER=disabled` still creates in-app alerts, records
email as skipped, and never sends those skipped emails later. It is suitable for
tests/environments that should not send mail.

## Configuration

| Variable | Purpose |
| --- | --- |
| `EMAIL_DRIVER` | `disabled` (default) or `smtp`, consistent on API and worker |
| `WEB_ORIGIN` | Web origin without trailing slash/path; HTTPS required in production |
| `REDIS_URL` | Worker Redis URL, supports `redis://` or verified `rediss://`, credentials and database number |
| `NOTIFICATION_QUEUE_PREFIX` | Redis namespace; default `microhrms`; use a distinct value per environment |
| `SMTP_HOST`, `SMTP_PORT` | Worker SMTP server; local defaults 127.0.0.1:1025 |
| `SMTP_SECURE` | `true` for implicit TLS, normally port 465 |
| `SMTP_REQUIRE_TLS` | `true` to require STARTTLS, normally port 587; default true in production |
| `SMTP_USER`, `SMTP_PASSWORD` | Optional pair, injected as secrets; use provider credentials in UAT/production |
| `SMTP_FROM` | Verified sender; explicitly required in production |
| `NOTIFICATION_KEY_VERSION` | Active invitation-delivery encryption key, default `v1` |
| `NOTIFICATION_DATA_KEYS` | JSON map from key version to base64-encoded 32-byte key; required for SMTP on API and worker |

Production SMTP must use implicit TLS or required STARTTLS with certificate
verification. SMTP authentication and sender-domain verification depend on your
provider. Configure SPF/DKIM/DMARC with that provider before external delivery.

Authentication continues to store a token hash. The outbox temporarily holds an
AES-256-GCM encrypted copy needed for asynchronous invitation email, bound to its
tenant/event IDs. It is not included in JSON payloads, Redis jobs, logs, audits or
public APIs. The activation link uses `/activate#token`, matching the existing
frontend and keeping the credential out of server URL logs. Delivery clears the
encrypted copy after send, expiry/replacement, skip or final failure. Keep the
worker running to clean pending expired invitations. Failed invitations require
issuing a replacement link; they cannot be manually retried with the old credential.
Password-reset emails use the same encrypted-secret delivery, with a distinct
token purpose and `/reset-password#token` link. Failed resets require a new public
recovery request and cannot be manually retried from the delivery screen.

For key rotation, add a new key to both API and worker, change the active version,
and retain older keys until pending invitations using them have completed/expired.
Back up keys in the environment's secret store; never commit them. Removing an old
key early fails the affected invitation delivery and requires a replacement link.

## UAT / production deployment

1. Apply migration `Notifications1791450000000` with migration credentials before
   starting the new API/worker build. Apply all later migrations too, including
   [background generation](background-jobs.md); the current sequence has 12 migrations.
   Runtime processes use `microhrms_app`, never migration credentials.
2. Provision private Redis (AOF/persistence, `noeviction`, monitored memory). Use
   network isolation and Redis authentication/TLS appropriate to your hosting setup.
   Do not expose Redis or Mailpit publicly; do not deploy Mailpit as a production
   email provider.
3. Inject SMTP credentials, verified sender, HTTPS web origin, notification keys,
   Redis namespace and the existing verified-TLS PostgreSQL settings. API and worker
   must agree on email driver, origin and key versions.
4. Build with `npm.cmd run build:api` (Linux: `npm run build:api`). Run the worker from
   the deployed repository root with
   `node apps/api/dist/modules/notifications/worker-main.js` under Docker/systemd.
   The worker exposes no HTTP port. Use restart policies and allow graceful shutdown
   before replacing containers.
5. With an API image that contains the npm workspace at `/app`, use the supplemental
   [Compose example](../infra/notifications/compose.production.example.yaml).
   Set `MICROHRMS_API_IMAGE` and an absolute `MICROHRMS_WORKER_ENV_FILE` pointing to
   a restricted environment file. Adjust `working_dir`/command if your image layout
   differs. Configure `REDIS_URL=redis://notification-redis:6379` for that example's
   private container network. On Ubuntu:

   ```bash
   docker compose -p microhrms-notifications \
     -f infra/notifications/compose.production.example.yaml up -d
   docker compose -p microhrms-notifications \
     -f infra/notifications/compose.production.example.yaml logs --tail=100 notification-worker
   ```

6. Send a synthetic invitation through the existing company/user workflow, verify
   the activation link, then test approval and payslip alerts. Test SMTP failure
   and recovery with a test account before launch. Provider delivery is not enabled
   merely by installing this feature; SMTP credentials/domain setup are still needed.
7. Monitor worker process health, sanitized queue warnings, pending event age and
   failed deliveries. PostgreSQL preserves intent when Redis is unavailable. Restore
   DB/keys before restarting consumers; do not blindly replay old SMTP-accepted
   deliveries after restoring an earlier database backup.

`notification_dispatch_candidates` is a deliberate cross-tenant discovery view:
it exposes only due event UUID, tenant UUID and availability time for active tenants.
The runtime role receives SELECT on this view, not unscoped reads of outbox contents
or HR records. Owner-only SELECT policies allow the view to work when FORCE RLS
applies to a non-superuser migration owner. Consumer reads/writes still enforce RLS.
Suspended/archived tenants are not dispatched; queued jobs also check active status.

## API and tests

All paths are under `/api/v1`; tenant authentication and mutation CSRF headers apply.

| Method/path | Access |
| --- | --- |
| `GET /notifications?status=all&page=1&limit=20` | Own inbox |
| `GET /notifications/unread-count` | Own count |
| `PUT /notifications/:id/read` with `{ "read": true }` | Own read/unread state |
| `PUT /notifications/read-all` with `{}` | Own inbox |
| `GET /notifications/deliveries?status=failed` | `company.manage`, own tenant |
| `POST /notifications/deliveries/:id/retry` with `{}` | `company.manage`, failed workflow email only |

Run `npm.cmd run notifications:up`, then `npm.cmd run notifications:test`.
Tests create/drop a random local PostgreSQL database, use a unique Redis namespace,
and deliver synthetic messages only to local Mailpit. They cover ownership, real
leave/attendance hooks, rollback/idempotency, retry limits, encrypted invitation
delivery and manager-access changes. Payroll tests cover publication alerts.
Angular tests and browser checks cover inbox actions, badge updates, admin retry
errors and responsive layouts. Shared Postman folder **14 Notifications and email
delivery** includes all six endpoints.

Library references: [BullMQ connections](https://docs.bullmq.io/guide/connections),
[idempotent jobs](https://docs.bullmq.io/patterns/idempotent-jobs),
[Nodemailer SMTP settings](https://nodemailer.com/smtp).

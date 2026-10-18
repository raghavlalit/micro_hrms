# Company password recovery

## User flow

1. On the sign-in screen, choose **Company user**, then **Forgot password?**.
2. Enter the company code and account email. The response is identical whether
   the company/account exists, is inactive, or is eligible for recovery.
3. Open the latest email link within **30 minutes**. Each new eligible request
   replaces earlier reset links. A request alone does not change the password or
   sign out existing sessions.
4. Choose and confirm a **15–128 character** password. A successful reset revokes
   all sessions for that account and consumes its pending password-reset tokens.
5. Sign in again as a Company user. Resetting does not automatically sign in.

This is company-account recovery. It does not reset platform administrators,
activate invited users, enable disabled accounts, or reactivate companies.
Platform accounts continue to use the existing operator-managed provisioning
process. Invitations still use their separate activation flow.

## Local setup

No new migration or environment variable is required. Existing `auth_tokens`
already supports `password_reset`. The SMTP worker and encryption keys from
[notification setup](notifications.md) are required:

```powershell
npm.cmd run notifications:setup
npm.cmd run notifications:up
```

Check that `EMAIL_DRIVER=smtp` is set in `apps/api/.env` (the setup command preserves
existing settings). Start API, frontend and worker in separate terminals:

```powershell
npm.cmd run dev:api
npm.cmd run dev:web
npm.cmd run notifications:worker
```

Open `http://localhost:4200/forgot-password`. Use an existing active test company
account, then inspect its email at `http://localhost:8025` (Mailpit). Local mail
never goes to the external recipient. With `EMAIL_DRIVER=disabled`, the request
still returns the generic response but creates no token/email and leaves pending
reset links unchanged. With the worker stopped, eligible requests remain queued
and their original 30-minute lifetime still applies.

Deploy the rebuilt API, worker and web together in UAT/production. Configure the
HTTPS `WEB_ORIGIN`, SMTP provider and the same notification encryption keys on API
and worker. Reset URLs use that configured origin, never the request Host header.

## API and Postman

Both endpoints are public but require `X-HRMS-Request: 1`; the existing Origin
checks apply. Responses are not cacheable. Unknown body fields are rejected.

| Endpoint | Body | Result |
| --- | --- | --- |
| `POST /api/v1/auth/forgot-password` | `{ "company": "acme", "email": "user@example.test" }` | HTTP 200 with a generic message; no token/account details |
| `POST /api/v1/auth/reset-password` | `{ "token": "<email fragment>", "password": "<new password>" }` | HTTP 200 on success; 401 for invalid/expired/used links |

Malformed input returns 400, rate limits return 429, and transient infrastructure
failures may return 5xx. Email and company code are trimmed and lowercased.

Shared Postman **01 Authentication** contains both requests. For local testing,
copy only the string after `#` in the Mailpit link into `reset_token`, and set
`reset_password` locally. Successful reset clears the token variable. Update
`tenant_password` before logging in again. The checked-in environment contains
neither passwords nor populated tokens.

## Security and delivery behavior

- Authentication stores a SHA-256 token hash; the random secret has 32 bytes of
  entropy. Reset tokens have a distinct `.r.` purpose marker and are checked
  against the `password_reset` purpose inside the correct tenant transaction.
- Email delivery temporarily holds a separately AES-GCM encrypted token in the
  outbox. Tokens never appear in API responses, notification JSON payloads, Redis
  jobs or audit metadata. Worker completion, skip or final failure clears the
  encrypted copy. Pending expired/replaced secrets are cleared when dispatched.
- Email URLs use `/reset-password#token`. The page removes the fragment from
  browser history immediately and keeps the token only in component memory.
  Reloading that page requires reopening the email link.
- User-row locks serialize issuance, consumption, normal password changes and
  login. Concurrent consumption succeeds once. Password/session/token changes and
  the success audit entry commit together. Normal authenticated password changes
  also invalidate pending recovery tokens.
- Worker delivery rechecks token purpose, expiry, consumption and active account
  status. A failed reset email cannot be manually requeued by company admins;
  request a new link. SMTP delivery retains the existing at-least-once semantics.
- Limits per 15-minute window: **30 requests per IP**, **5 per company/email**,
  **50 reset submissions per IP**, and **10 per token**. Counter updates persist
  even for rejected attempts. Limits do not depend on whether an account exists.
- Request handling uses a 300 ms minimum after throttling to reduce obvious
  account-lookup timing differences; it is not a constant-time network guarantee.
  Existing proxy/IP trust configuration still applies.
- Audit actions are `user.password_reset_requested` (no authenticated actor)
  and `user.password_reset` (account whose token was consumed). No passwords,
  hashes or tokens are recorded in those audit entries.

The company notification inbox also records the generic reset request. It never
contains the reset credential. A pending or failed email does not prove that the
recipient received or opened it.

## Verification and code ownership

```powershell
npm.cmd run recovery:test
npm.cmd run auth:test
npm.cmd run notifications:test
npm.cmd run test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run postman:check
```

Recovery tests create/drop a disposable local database and send synthetic email
only to Mailpit. They cover enumeration-safe responses, CSRF, tenant/purpose
boundaries, replacement/expiry, concurrent single use, session invalidation,
normal password changes, rollback, delivery failure, rate limits and a working
link captured by the real SMTP adapter. Angular/browser checks cover the forms,
confirmation, rate-limit guidance, URL clearing, missing/expired links and mobile
layouts.

API recovery orchestration/DTOs/controller live in `modules/auth`. Transport and
templates remain in `modules/notifications`. Angular code lives in
`features/auth`; root routing only connects the screens.

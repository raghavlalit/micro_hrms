# Document management

HR can upload employee documents, control sharing, update metadata, replace files
with new versions and archive records. Employees can read/download shared documents.
Files are private and downloads are authenticated; the application does not expose
storage keys or public object URLs.

## Company workflow

1. Sign in with `documents.manage` and review **Document categories**.
2. Open **Documents > Upload document**. Search/select the employee and choose the
   title, category, visibility and optional issue/expiry dates. Add a reason.
3. Select one nonempty PDF, PNG or JPEG, maximum **10 MiB**. The API checks extension,
   supplied MIME type, content signatures and size. The first version is saved
   with a SHA-256 checksum and uploader reference.
4. Open the document to see its metadata and version history. Downloads are
   attachments; files are not embedded or executed in the application.
5. Use **Edit details** to change sharing, title, category or dates. Sharing applies
   to all available versions. Issue/expiry dates are calendar dates, not timestamps.
6. Use **Upload new version** to replace a file while retaining earlier versions.
   New versions keep the document's existing sharing and dates.
7. Archive an incorrect version to hide it from employees/managers. The highest
   remaining available version becomes current. To archive the last available
   version, archive the whole document first.
8. Archive the document when it should no longer be shared. HR can still find it
   using **Status > Archived**, view history and download retained files.

There is no hard-delete or restore endpoint. Archived files still use storage.
An expired document remains accessible; expiry is metadata for filtering and future
reminder jobs. **Expired** means before today; **Expiring in 30 days** includes
today through today+30, based on the company's timezone.

## Access rules

| Permission             | Access                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `documents.manage`     | All company documents, upload, metadata edits, version/document archive and retained downloads        |
| `documents.read.self`  | Linked employee's unarchived documents with `employee` or `team` visibility; unarchived versions only |
| `documents.read.team`  | Current direct reports' unarchived `team` documents; unarchived versions only                         |
| Platform administrator | No company document access through platform credentials                                               |

New uploads default to **HR only** in the screen and Postman example. `team`
means HR, the employee and a permitted direct manager. Merely being a manager or
having `employees.read.team` does not grant document access. The new team-document
permission is available in the role catalog but is **not added to default manager
or employee roles**. Assign it explicitly through a custom/company role when needed.
Reporting changes affect subsequent requests. Sharing cannot recall a file already
downloaded by an authorized user.

Uploads are HR-managed in this release. Employee self-upload, recursive reporting
scope, Office/ZIP files, automated reminders, malware scanning and restore/deletion
workflows remain separate features. Signature checking is not a malware scanner;
restrict uploads to trusted HR users and scan files through your operational process.

## Storage and deployment

Development defaults to private local storage at `apps/api/storage/documents`,
which is ignored by Git. PostgreSQL stores metadata, checksums and opaque keys,
not file bytes. Local files use exclusive writes and restricted permissions.

Production (`NODE_ENV=production`) requires `DOCUMENT_STORAGE_DRIVER=s3`; the API
fails startup if this is missing or set to local. Configure a dedicated private
S3/S3-compatible bucket for each environment. Production buckets must support
conditional writes and AES256 server-side encryption. Cloud configuration is an
operator task; implementation tests use local storage and a local S3 protocol stub.

```dotenv
DOCUMENT_STORAGE_DRIVER=s3
DOCUMENT_S3_BUCKET=microhrms-uat-documents
DOCUMENT_S3_REGION=ap-south-1
# For an S3-compatible provider only:
# DOCUMENT_S3_ENDPOINT=https://your-private-object-storage.example
# DOCUMENT_S3_FORCE_PATH_STYLE=true
# Default quota per company, including archived versions: 1 GiB
DOCUMENT_TENANT_QUOTA_BYTES=1073741824
```

Use an instance/task IAM role when available. Otherwise inject `AWS_ACCESS_KEY_ID`,
`AWS_SECRET_ACCESS_KEY` and, when appropriate, `AWS_SESSION_TOKEN` through the
deployment secrets manager. Never commit credential values or expose them to Angular.

For AWS S3, enable Block Public Access, bucket-owner-enforced ownership, default
encryption and bucket versioning/backups. Grant the API only `s3:PutObject` and
`s3:GetObject` on `arn:aws:s3:::YOUR_BUCKET/*`; no public ACL, bucket management or
delete permission is needed. Restrict access to HTTPS. S3-compatible deployments
must configure equivalent private access and encryption. Browser CORS on the
bucket is unnecessary because uploads/downloads pass through the authenticated API.

Example addition to your existing UAT/production Compose API service:

```yaml
services:
  api:
    environment:
      DOCUMENT_STORAGE_DRIVER: s3
      DOCUMENT_S3_BUCKET: ${DOCUMENT_S3_BUCKET}
      DOCUMENT_S3_REGION: ${DOCUMENT_S3_REGION}
      DOCUMENT_TENANT_QUOTA_BYTES: 1073741824
      # Inject role credentials or secrets through your deployment environment.
```

The repository's `compose.yaml` currently starts local PostgreSQL only. Do not
replace it with this partial example. Payslip storage remains configured separately.
For local Docker testing with the local driver, mount a private persistent volume
and set `DOCUMENT_STORAGE_DIR` to that volume path; never serve it through Nginx.

Allow multipart overhead above the API's 10 MiB file limit in Nginx:

```nginx
# Inside the existing HTTPS server block:
client_max_body_size 12m;
```

Install/build the release and migrate once with the migrator environment:

```bash
npm ci
npm run build
npm run migration:run --workspace=apps/api
npm run migration:show --workspace=apps/api
```

Use `npm.cmd` on Windows. In Compose, execute migration commands in a one-off
release-image job using migrator credentials, then start the API with only runtime
DB credentials and document storage configuration. Back up PostgreSQL before
migration, and back up/restore object storage and database metadata together.

The application uses unique opaque object keys, conditional S3 writes and checksum
verification on download. A missing/corrupted file returns 503 and requires operator
recovery from backup. It never silently serves mismatching bytes.

Files are saved before the database transaction commits. A failed transaction can
leave an unreferenced file; a retry uses a new object key and cannot overwrite a
published version. Reconcile orphan files against `document_versions.object_key`
under an approved maintenance/retention procedure; do not delete objects solely
because they are old. Quota counts committed metadata, including archived versions;
monitor bucket usage separately for failed-upload orphans.

Before UAT sign-off, upload a synthetic file through the deployed S3 bucket, download
it as the intended employee, verify another employee receives 404, then test a new
version and archiving. The live bucket has not been provisioned or tested by this task.

## Database changes and code ownership

Migration `1791440000000-DocumentManagement` adds:

- `documents.revision`: non-null UUID with `gen_random_uuid()` default, rotated
  after each mutation to reject stale screens/API requests.
- Global permission `documents.read.team`. Existing tenant assignments are not
  broadened by the migration.
- An immutable-version trigger: file key, checksum, uploader and other version
  metadata cannot be rewritten. Only archive/update timestamps may change.

Follow-up migration `1791440000001-DocumentManagementGrants` adds the narrower
`documents.read.team` grant to existing roles that already have `documents.manage`.
They already have access to every company document; this lets authorized role
administrators delegate team access under the existing permission-delegation rules.
Each added grant is audited. Default manager/employee roles are unchanged. Rollback
retains these grants and audits to avoid revoking later HR configuration.

Existing tenant-aware document/category/employee/user foreign keys and RLS remain
in force. No employee or file data is seeded. Rollback removes the column/trigger;
it retains the global permission because tenant roles may reference it. A rollback
is incompatible with this API build and must be coordinated with an older release.

API code stays in `apps/api/src/modules/documents`; employee lookups are exposed
by `employees/employee-document.service.ts`. A deliberate document read model joins
only employee identity/reporting fields for scope and display. Persistence uses
TypeORM repositories and QueryBuilder within tenant transactions. Tenant row locks
serialize writes, version numbering and quota checks. Angular screens, forms,
models and API client stay in `apps/web/src/app/features/documents`.

## API and Postman

All paths below start with `/api/v1`. Mutations need the session cookie and
`X-HRMS-Request: 1`. Browser origins must match `AUTH_ORIGINS`.

| Method | Path                                          | Purpose                                                                        |
| ------ | --------------------------------------------- | ------------------------------------------------------------------------------ |
| GET    | `/documents`                                  | Scoped paginated library; search, employee/category, status and expiry filters |
| GET    | `/documents/people`                           | HR employee selector                                                           |
| POST   | `/documents`                                  | Multipart upload plus document metadata                                        |
| GET    | `/documents/:id`                              | Metadata, revision and available versions                                      |
| PUT    | `/documents/:id`                              | Full metadata replacement plus revision/reason                                 |
| POST   | `/documents/:id/versions`                     | Multipart replacement plus revision/reason/operation ID                        |
| POST   | `/documents/:id/archive`                      | Archive whole record                                                           |
| POST   | `/documents/:id/versions/:versionId/archive`  | Archive one version                                                            |
| GET    | `/documents/:id/versions/:versionId/download` | Audited private attachment                                                     |

Use **12 - Document management** in the shared [Postman collection](../postman/README.md).
For uploads, use **Body > form-data**, select one local file in `file`, and leave
Content-Type unset so Postman creates the multipart boundary. The JSON file does
not embed files or personal paths.

Use a new `document_upload_operation_id` for each document and a new
`document_version_operation_id` for each replacement. Retain each UUID and the same
file/fields for retries. Refresh detail after successful changes to update
`document_revision_id`; choose `document_version_id` explicitly from history.
Metadata PUT uses empty/null dates to clear them. A 409 requires refreshing and
reviewing current state; a failed upload does not create an empty document record.

## Verification

```powershell
npm.cmd run documents:test
npm.cmd run db:test
npm.cmd test --workspace=apps/web -- --watch=false
npm.cmd run build
npm.cmd run lint --workspace=apps/api
npm.cmd run postman:generate
npm.cmd run postman:check
```

Tests use disposable PostgreSQL databases and synthetic files. Coverage includes
tenant/employee/team isolation, CSRF, file limits, retries, stale updates, concurrent
versions, immutability, archive visibility, expiry filters, quota, storage failure
rollback and checksums. The S3 protocol test exercises the actual SDK locally.
Browser checks cover HR and employee flows at desktop/mobile sizes.

Implementation references: [NestJS file uploads](https://docs.nestjs.com/techniques/file-upload)
and [AWS SDK S3 operations](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_s3_code_examples.html).

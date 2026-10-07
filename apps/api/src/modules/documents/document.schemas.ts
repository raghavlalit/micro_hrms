import {
  schema,
  uuid,
  text,
  date,
  timestamp,
  integer,
  state,
  unique,
  index,
  check,
  tenantFk,
} from '../../database/schema-helpers';
export const DocumentCategory = schema(
  'document_categories',
  { code: text(), name: text(), archived_at: timestamp(true) },
  { uniques: [unique('tenant_id', 'code')] },
);
export const EmployeeDocument = schema(
  'documents',
  {
    employee_id: uuid(),
    category_id: uuid(),
    title: text(),
    issue_date: date(true),
    expiry_date: date(true),
    visibility: state('hr_only'),
    archived_at: timestamp(true),
  },
  {
    foreignKeys: [
      tenantFk('employees', 'employee_id'),
      tenantFk('document_categories', 'category_id'),
    ],
    indices: [
      index('tenant_id', 'employee_id'),
      index('tenant_id', 'expiry_date'),
    ],
    checks: [
      check("visibility IN ('hr_only','employee','team')"),
      check(
        'expiry_date IS NULL OR issue_date IS NULL OR expiry_date >= issue_date',
      ),
    ],
  },
);
export const DocumentVersion = schema(
  'document_versions',
  {
    document_id: uuid(),
    version: integer(1),
    object_key: text(),
    original_filename: text(),
    mime_type: text(),
    size_bytes: { type: 'bigint' },
    checksum: text(true),
    uploaded_by: uuid(),
    archived_at: timestamp(true),
  },
  {
    uniques: [
      unique('tenant_id', 'document_id', 'version'),
      unique('tenant_id', 'object_key'),
    ],
    foreignKeys: [
      tenantFk('documents', 'document_id'),
      tenantFk('users', 'uploaded_by'),
    ],
    checks: [check('version > 0 AND size_bytes > 0')],
  },
);

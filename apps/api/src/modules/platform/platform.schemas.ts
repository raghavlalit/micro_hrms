import {
  schema,
  uuid,
  text,
  timestamp,
  tenantFk,
  flag,
} from '../../database/schema-helpers';
// Internal operator identities are deliberately not tenant application users.
export const PlatformAdmin = schema(
  'platform_admins',
  {
    email: text(),
    password_hash: text(),
    disabled_at: timestamp(true),
    must_change_password: flag(true),
  },
  { uniques: [{ columns: ['email'] }] },
  false,
);
export const SupportAccessGrant = schema(
  'support_access_grants',
  {
    platform_admin_id: uuid(),
    approved_by: uuid(),
    reason: text(),
    expires_at: timestamp(),
    revoked_at: timestamp(true),
  },
  {
    foreignKeys: [
      tenantFk('users', 'approved_by'),
      {
        target: 'platform_admins',
        columnNames: ['platform_admin_id'],
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      },
    ],
  },
);

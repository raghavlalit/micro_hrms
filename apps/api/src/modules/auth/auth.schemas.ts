import {
  schema,
  text,
  uuid,
  timestamp,
  integer,
  unique,
  index,
  state,
  json,
  check,
  tenantFk,
} from '../../database/schema-helpers';

export const PlatformSession = schema(
  'platform_sessions',
  {
    platform_admin_id: uuid(),
    credential_hash: text(),
    expires_at: timestamp(),
    revoked_at: timestamp(true),
  },
  {
    uniques: [unique('credential_hash')],
    indices: [index('platform_admin_id')],
    foreignKeys: [
      {
        target: 'platform_admins',
        columnNames: ['platform_admin_id'],
        referencedColumnNames: ['id'],
        onDelete: 'RESTRICT',
      },
    ],
  },
  false,
);

export const AuthRateLimit = schema(
  'auth_rate_limits',
  {
    key: text(),
    attempts: integer(),
    expires_at: timestamp(),
  },
  { uniques: [unique('key')] },
  false,
);

export const AuthToken = schema(
  'auth_tokens',
  {
    user_id: uuid(),
    purpose: state('invitation'),
    token_hash: text(),
    expires_at: timestamp(),
    consumed_at: timestamp(true),
  },
  {
    uniques: [unique('tenant_id', 'token_hash')],
    foreignKeys: [tenantFk('users', 'user_id')],
    indices: [index('tenant_id', 'user_id', 'purpose')],
    checks: [
      check("purpose IN ('invitation','password_reset','email_verification')"),
    ],
  },
);
export const Session = schema(
  'sessions',
  {
    user_id: uuid(),
    credential_hash: text(),
    expires_at: timestamp(),
    revoked_at: timestamp(true),
    metadata: json(),
  },
  {
    uniques: [unique('tenant_id', 'credential_hash')],
    foreignKeys: [tenantFk('users', 'user_id')],
    indices: [index('tenant_id', 'user_id')],
  },
);

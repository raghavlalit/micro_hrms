import {
  schema,
  text,
  uuid,
  state,
  timestamp,
  unique,
  check,
  tenantFk,
} from '../../database/schema-helpers';
export const User = schema(
  'users',
  {
    email: text(),
    display_name: text(),
    password_hash: text(true),
    status: state('invited'),
    last_login_at: timestamp(true),
  },
  {
    uniques: [unique('tenant_id', 'email')],
    checks: [
      check('email = lower(email)'),
      check("status IN ('invited','active','disabled')"),
    ],
  },
);
export const Role = schema(
  'roles',
  { code: text(), name: text() },
  { uniques: [unique('tenant_id', 'code')] },
);
export const Permission = schema(
  'permissions',
  { code: text(), description: text() },
  { uniques: [unique('code')] },
  false,
);
export const UserRole = schema(
  'user_roles',
  { user_id: uuid(), role_id: uuid() },
  {
    uniques: [unique('tenant_id', 'user_id', 'role_id')],
    foreignKeys: [tenantFk('users', 'user_id'), tenantFk('roles', 'role_id')],
  },
);
export const RolePermission = schema(
  'role_permissions',
  { role_id: uuid(), permission_code: text() },
  {
    uniques: [unique('tenant_id', 'role_id', 'permission_code')],
    foreignKeys: [
      tenantFk('roles', 'role_id'),
      {
        target: 'permissions',
        columnNames: ['permission_code'],
        referencedColumnNames: ['code'],
        onDelete: 'RESTRICT',
      },
    ],
  },
);

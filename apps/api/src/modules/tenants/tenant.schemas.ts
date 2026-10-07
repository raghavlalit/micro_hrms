import {
  schema,
  text,
  state,
  json,
  timestamp,
  integer,
  unique,
  check,
} from '../../database/schema-helpers';

export const SubscriptionPlan = schema(
  'subscription_plans',
  {
    code: text(),
    name: text(),
    employee_limit: integer(100),
    user_limit: integer(100),
    entitlements: json(),
  },
  {
    uniques: [unique('code')],
    checks: [check('employee_limit > 0 AND user_limit > 0')],
  },
  false,
);

export const Tenant = schema(
  'tenants',
  {
    name: text(),
    slug: text(),
    status: state('trial'),
    timezone: { type: 'text', default: 'Asia/Kolkata' },
    currency: { type: 'varchar', length: 3, default: 'INR' },
    date_format: { type: 'text', default: 'dd/MM/yyyy' },
    contact_email: text(true),
    contact_phone: text(true),
    address: json(),
    logo_object_key: text(true),
    plan_code: { type: 'text', default: 'trial' },
    trial_starts_at: timestamp(true),
    trial_ends_at: timestamp(true),
    employee_limit: integer(100),
    user_limit: integer(100),
    active_employee_count: integer(),
    settings: json(),
    archived_at: timestamp(true),
  },
  {
    uniques: [unique('slug')],
    foreignKeys: [
      {
        target: 'subscription_plans',
        columnNames: ['plan_code'],
        referencedColumnNames: ['code'],
        onDelete: 'RESTRICT',
      },
    ],
    checks: [
      check("status IN ('trial','active','suspended','closed')"),
      check("slug = lower(slug) AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'"),
      check(
        'employee_limit > 0 AND user_limit > 0 AND active_employee_count >= 0',
      ),
      check('trial_ends_at IS NULL OR trial_ends_at >= trial_starts_at'),
    ],
  },
  false,
);

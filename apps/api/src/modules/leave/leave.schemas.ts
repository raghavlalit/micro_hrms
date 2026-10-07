import {
  schema,
  text,
  uuid,
  date,
  timestamp,
  flag,
  decimal,
  state,
  json,
  unique,
  index,
  check,
  tenantFk,
} from '../../database/schema-helpers';
export const LeaveType = schema(
  'leave_types',
  {
    code: text(),
    name: text(),
    description: text(true),
    is_active: flag(true),
  },
  { uniques: [unique('tenant_id', 'code')] },
);
export const LeavePolicy = schema(
  'leave_policies',
  {
    leave_type_id: uuid(),
    name: text(),
    annual_entitlement: decimal(2, '0'),
    is_paid: flag(true),
    balance_controlled: flag(true),
    carry_forward_enabled: flag(),
    exclude_non_working_days: flag(true),
    applicability: json(),
    effective_from: date(),
    effective_to: date(true),
    archived_at: timestamp(true),
  },
  {
    foreignKeys: [tenantFk('leave_types', 'leave_type_id')],
    checks: [
      check('annual_entitlement >= 0'),
      check('effective_to IS NULL OR effective_to >= effective_from'),
    ],
  },
);
export const EmployeeLeavePolicy = schema(
  'employee_leave_policies',
  {
    employee_id: uuid(),
    policy_id: uuid(),
    effective_from: date(),
    effective_to: date(true),
  },
  {
    uniques: [
      unique('tenant_id', 'employee_id', 'policy_id', 'effective_from'),
    ],
    foreignKeys: [
      tenantFk('employees', 'employee_id'),
      tenantFk('leave_policies', 'policy_id'),
    ],
    checks: [check('effective_to IS NULL OR effective_to >= effective_from')],
  },
);
export const LeaveBalance = schema(
  'leave_balances',
  {
    employee_id: uuid(),
    leave_type_id: uuid(),
    period_start: date(),
    period_end: date(),
    credited: decimal(2, '0'),
    used: decimal(2, '0'),
    pending: decimal(2, '0'),
    adjusted: decimal(2, '0'),
  },
  {
    uniques: [
      unique('tenant_id', 'employee_id', 'leave_type_id', 'period_start'),
    ],
    foreignKeys: [
      tenantFk('employees', 'employee_id'),
      tenantFk('leave_types', 'leave_type_id'),
    ],
    checks: [
      check('period_end >= period_start'),
      check('credited >= 0 AND used >= 0 AND pending >= 0'),
      check('credited + adjusted - used - pending >= 0'),
    ],
  },
);
export const LeaveRequest = schema(
  'leave_requests',
  {
    employee_id: uuid(),
    leave_type_id: uuid(),
    policy_id: uuid(),
    start_date: date(),
    end_date: date(),
    units: decimal(),
    start_half: state('full'),
    end_half: state('full'),
    reason: text(),
    status: state('pending'),
    reviewer_id: uuid(true),
    reviewed_at: timestamp(true),
    review_comment: text(true),
    cancelled_at: timestamp(true),
    calculation: json(),
  },
  {
    foreignKeys: [
      tenantFk('employees', 'employee_id'),
      tenantFk('leave_types', 'leave_type_id'),
      tenantFk('leave_policies', 'policy_id'),
      tenantFk('users', 'reviewer_id'),
    ],
    indices: [
      index('tenant_id', 'employee_id', 'start_date'),
      index('tenant_id', 'status'),
    ],
    checks: [
      check('end_date >= start_date AND units > 0 AND mod(units, 0.5) = 0'),
      check("status IN ('pending','approved','rejected','cancelled')"),
      check(
        "start_half IN ('full','am','pm') AND end_half IN ('full','am','pm')",
      ),
    ],
  },
);
export const LeaveBalanceEntry = schema(
  'leave_balance_entries',
  {
    balance_id: uuid(),
    request_id: uuid(true),
    actor_id: uuid(true),
    kind: state('credit'),
    units: decimal(),
    reason: text(),
    idempotency_key: text(),
  },
  {
    uniques: [unique('tenant_id', 'idempotency_key')],
    foreignKeys: [
      tenantFk('leave_balances', 'balance_id'),
      tenantFk('leave_requests', 'request_id'),
      tenantFk('users', 'actor_id'),
    ],
    checks: [
      check("kind IN ('credit','reserve','release','use','restore','adjust')"),
      check('units <> 0'),
    ],
  },
);

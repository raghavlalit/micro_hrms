import {
  schema,
  text,
  uuid,
  date,
  timestamp,
  decimal,
  flag,
  state,
  json,
  unique,
  index,
  check,
  tenantFk,
} from '../../database/schema-helpers';
export const SalaryComponent = schema(
  'salary_components',
  { code: text(), name: text(), kind: state('earning'), is_active: flag(true) },
  {
    uniques: [unique('tenant_id', 'code')],
    checks: [check("kind IN ('earning','deduction')")],
  },
);
export const SalaryStructure = schema(
  'salary_structures',
  {
    employee_id: uuid(),
    effective_from: date(),
    effective_to: date(true),
    currency: { type: 'varchar', length: 3 },
    created_by: uuid(true),
  },
  {
    uniques: [unique('tenant_id', 'employee_id', 'effective_from')],
    foreignKeys: [
      tenantFk('employees', 'employee_id'),
      tenantFk('users', 'created_by'),
    ],
    checks: [check('effective_to IS NULL OR effective_to >= effective_from')],
  },
);
export const SalaryStructureLine = schema(
  'salary_structure_lines',
  { salary_structure_id: uuid(), component_id: uuid(), amount: decimal() },
  {
    uniques: [unique('tenant_id', 'salary_structure_id', 'component_id')],
    foreignKeys: [
      tenantFk('salary_structures', 'salary_structure_id'),
      tenantFk('salary_components', 'component_id'),
    ],
    checks: [check('amount >= 0')],
  },
);
export const PayrollRun = schema(
  'payroll_runs',
  {
    period_start: date(),
    period_end: date(),
    pay_date: date(true),
    status: state('draft'),
    currency: { type: 'varchar', length: 3 },
    gross_total: decimal(2, '0'),
    deduction_total: decimal(2, '0'),
    net_total: decimal(2, '0'),
    calculation_config: json(),
    reviewed_by: uuid(true),
    reviewed_at: timestamp(true),
    locked_by: uuid(true),
    locked_at: timestamp(true),
    published_at: timestamp(true),
  },
  {
    uniques: [unique('tenant_id', 'period_start', 'period_end')],
    foreignKeys: [
      tenantFk('users', 'reviewed_by'),
      tenantFk('users', 'locked_by'),
    ],
    checks: [
      check('period_end >= period_start'),
      check(
        "status IN ('draft','processing','calculated','reviewed','locked')",
      ),
      check(
        'gross_total >= 0 AND deduction_total >= 0 AND net_total = gross_total - deduction_total',
      ),
      check(
        "status <> 'locked' OR (locked_at IS NOT NULL AND locked_by IS NOT NULL)",
      ),
      check("published_at IS NULL OR status = 'locked'"),
    ],
  },
);
export const PayrollEmployee = schema(
  'payroll_employees',
  {
    payroll_run_id: uuid(),
    employee_id: uuid(),
    gross: decimal(2, '0'),
    deductions: decimal(2, '0'),
    net: decimal(2, '0'),
    input_snapshot: json(),
  },
  {
    uniques: [unique('tenant_id', 'payroll_run_id', 'employee_id')],
    foreignKeys: [
      tenantFk('payroll_runs', 'payroll_run_id'),
      tenantFk('employees', 'employee_id'),
    ],
    checks: [
      check('gross >= 0 AND deductions >= 0 AND net = gross - deductions'),
    ],
  },
);
export const PayrollLine = schema(
  'payroll_lines',
  {
    payroll_employee_id: uuid(),
    component_id: uuid(true),
    component_code: text(),
    component_name: text(),
    kind: state('earning'),
    amount: decimal(),
    is_manual: flag(),
    adjustment_reason: text(true),
  },
  {
    foreignKeys: [
      tenantFk('payroll_employees', 'payroll_employee_id'),
      tenantFk('salary_components', 'component_id'),
    ],
    indices: [index('tenant_id', 'payroll_employee_id')],
    checks: [
      check('amount >= 0'),
      check("kind IN ('earning','deduction')"),
      check(
        'NOT is_manual OR (adjustment_reason IS NOT NULL AND length(trim(adjustment_reason)) > 0)',
      ),
    ],
  },
);
export const Payslip = schema(
  'payslips',
  {
    payroll_employee_id: uuid(),
    object_key: text(true),
    status: state('pending'),
    published_at: timestamp(true),
    generation_version: { type: 'integer', default: 1 },
  },
  {
    uniques: [unique('tenant_id', 'payroll_employee_id')],
    foreignKeys: [tenantFk('payroll_employees', 'payroll_employee_id')],
    checks: [
      check("status IN ('pending','generated','published','failed')"),
      check('generation_version > 0'),
      check(
        "status <> 'published' OR (published_at IS NOT NULL AND object_key IS NOT NULL)",
      ),
    ],
  },
);

export interface PayrollPerson {
  id: string;
  name: string;
  employee_code: string;
  status: string;
}
export interface SalaryComponent {
  id: string;
  code: string;
  name: string;
  kind: 'earning' | 'deduction';
  is_active: boolean;
}
export interface SalaryLine {
  component_id: string;
  amount: string;
  name?: string;
  kind?: string;
}
export interface SalaryRevision {
  id: string;
  effective_from: string;
  effective_to: string | null;
  currency: string;
  lines: SalaryLine[];
}
export interface PayrollLine {
  id: string;
  component_name: string;
  component_code: string;
  kind: 'earning' | 'deduction';
  amount: string;
  is_manual: boolean;
  adjustment_reason: string | null;
}
export interface PayrollSnapshot {
  employee: PayrollPerson;
  company_name: string;
  currency: string;
  calendar_days: number;
  employed_days: number;
  unpaid_half_units: number;
}
export interface PayrollItem {
  id: string;
  employee_id: string;
  gross: string;
  deductions: string;
  net: string;
  calculation_version: number;
  input_snapshot: PayrollSnapshot;
  lines: PayrollLine[];
}
export interface PayrollRun {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  currency: string;
  status: string;
  gross_total: string;
  deduction_total: string;
  net_total: string;
  calculation_version: number;
  published_at: string | null;
  calculation_config: {
    revision: string;
    unpaid_leave_deduction: boolean;
    excluded?: { id: string; name: string; reason: string }[];
    pending_leave?: number;
    pending_corrections?: number;
  };
}
export interface PayrollDetail {
  run: PayrollRun;
  items: PayrollItem[];
  versions: number[];
}
export interface Payslip {
  id: string;
  period_start: string;
  period_end: string;
  pay_date: string;
  currency: string;
  gross: string;
  deductions: string;
  net: string;
  published_at: string;
  employee?: PayrollPerson;
  company_name?: string;
  lines?: { name: string; kind: string; amount: string }[];
}

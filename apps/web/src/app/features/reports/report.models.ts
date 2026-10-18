export type ReportKind =
  'employees' | 'attendance' | 'leave' | 'balances' | 'payroll' | 'components';
export const REPORT_LABELS: Record<ReportKind, string> = {
  employees: 'Employee directory',
  attendance: 'Attendance',
  leave: 'Leave requests',
  balances: 'Leave balances',
  payroll: 'Payroll summary',
  components: 'Payroll components',
};
export interface ReportOptions {
  kind: ReportKind;
  scope: string;
  available: ReportKind[];
  today: string;
  departments: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  runs: { id: string; period_start: string; status: string; currency: string }[];
}
export interface ReportResult {
  kind: ReportKind;
  scope: string;
  columns: { key: string; label: string; type?: 'number' }[];
  rows: Record<string, string | number | null>[];
  total: number;
  page: number;
  limit: number;
  generated_at: string;
  row_limit: number;
}
export type ReportFilters = Record<string, string | number>;

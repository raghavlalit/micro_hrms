export interface Dashboard {
  today: string;
  timezone: string;
  generated_at: string;
  linked_employee: boolean;
  workforce: { scope: string; total: number; active: number } | null;
  attendance: {
    scope: string;
    available: boolean;
    reason: string | null;
    counts: Record<string, number> | null;
    own: { status: string; check_in: string | null; check_out: string | null } | null;
  } | null;
  pending: { kind: string; scope: string; count: number }[];
  holidays: { id: string; name: string; holiday_date: string; location_name: string | null }[];
  holiday_scope: string;
  milestones: { name: string; date: string; kind: string }[];
  payroll:
    { id: string; period_start: string; status: string; published_at: string | null }[] | null;
  balances:
    | {
        id: string;
        type_name: string;
        available: number;
        pending: number;
        used: number;
        balance_controlled: boolean;
      }[]
    | null;
  payslips: { id: string; period_start: string; currency: string; net: string }[] | null;
}

export interface LeavePerson {
  id: string;
  name: string;
  employee_code: string;
}
export interface LeaveAssignment {
  policy_id: string;
  leave_type_id: string;
  name: string;
  balance_controlled: boolean;
  is_paid: boolean;
  is_active: boolean;
  effective_from: string;
  effective_to: string;
}
export interface LeaveBalance {
  id: string;
  type_name: string;
  credited: number;
  adjusted: number;
  pending: number;
  used: number;
  available: number;
  balance_controlled: boolean;
}
export interface LeaveOverview {
  employee: LeavePerson;
  year: number;
  today: string;
  timezone: string;
  assignments: LeaveAssignment[];
  balances: LeaveBalance[];
}
export interface LeaveRequest {
  id: string;
  employee_id: string;
  name: string;
  type_name: string;
  start_date: string;
  end_date: string;
  start_half: string;
  end_half: string;
  units: number;
  reason: string;
  status: string;
  review_comment: string | null;
  can_review: boolean;
  can_cancel: boolean;
}
export interface LeaveApplication {
  policy_id: string;
  start_date: string;
  end_date: string;
  start_half: string;
  end_half: string;
  reason: string;
}
export interface LeavePreview {
  days: { date: string; units: number; half: string }[];
  units: number;
  available: number | null;
  is_paid: boolean;
  timezone: string;
}
export interface LeavePolicyOption {
  id: string;
  name: string;
  annual_entitlement: string;
  balance_controlled: boolean;
  carry_forward_enabled: boolean;
}
export interface LeaveCalendar {
  month: string;
  items: {
    request_id: string;
    employee_id: string;
    name: string;
    date: string;
    half: string;
    units: number;
  }[];
}
export interface LeaveEntry {
  id: string;
  kind: string;
  units: number;
  reason: string;
  created_at: string;
}

export interface AttendanceEmployee {
  id: string;
  employee_code: string;
  first_name: string;
  last_name: string;
  user_id: string | null;
  manager_id: string | null;
  location_id: string | null;
  work_schedule_id: string | null;
  joining_date: string;
  termination_date: string | null;
  status: string;
}
export interface AttendanceRules {
  timezone: string;
  schedule_id: string | null;
  schedule_name: string | null;
  working_days: number[];
  start_time: string;
  end_time: string;
  late_grace_minutes: number;
  half_day_minutes: number;
  full_day_minutes: number;
  location_id: string | null;
  holiday: boolean;
  weekly_off: boolean;
  configured: boolean;
}
export interface AttendanceRow {
  id: string;
  employee_id: string;
  work_date: string;
  check_in: Date | string | null;
  check_out: Date | string | null;
  worked_minutes: number;
  status: string;
  source: string;
  source_metadata: {
    rules?: AttendanceRules;
    late_minutes?: number;
    revision?: string;
    reason?: string;
  };
  updated_at: Date | string;
}

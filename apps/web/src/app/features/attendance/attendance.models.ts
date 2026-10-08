export interface AttendanceDay {
  leave_units?: number;
  id: string | null;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  worked_minutes: number;
  late_minutes: number;
  timezone: string;
  schedule_name: string | null;
  source: string;
  projected: boolean;
  future: boolean;
  can_request: boolean;
  can_adjust: boolean;
}
export interface AttendanceCalendar {
  employee: { id: string; name: string; employee_code: string; status: string };
  month: string;
  today: string;
  timezone: string;
  schedule: {
    name: string | null;
    start_time: string;
    end_time: string;
    half_day_minutes: number;
    full_day_minutes: number;
    late_grace_minutes: number;
    configured: boolean;
  };
  actions: {
    can_check_in: boolean;
    can_check_out: boolean;
    checked_in_at: string | null;
    checked_out_at: string | null;
  };
  items: AttendanceDay[];
  summary: {
    worked_minutes: number;
    late_days: number;
    absent_days: number;
    incomplete_days: number;
  };
}
export interface AttendancePerson {
  id: string;
  name: string;
  employee_code: string;
  status: string;
}
export interface Correction {
  id: string;
  employee_id: string;
  employee_name: string;
  employee_code: string;
  work_date: string;
  check_in: string;
  check_out: string;
  reason: string;
  status: string;
  timezone: string;
  review_comment: string | null;
  reviewed_at: string | null;
}
export interface AttendanceEdit {
  check_in: string | null;
  check_out: string | null;
  reason: string;
  mode?: string;
  work_date?: string;
}
export function displayTime(value: string | null, timezone: string): string {
  return value
    ? new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hourCycle: 'h23',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(value))
    : '—';
}
function dateParts(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(value);
  const n = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
}
// Interpret form clock times in the company timezone, never the browser timezone.
export function companyTimeToIso(date: string, time: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time))
    throw new Error('Enter both times.');
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target)) throw new Error('Enter valid times.');
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const probe = target + hours * 3600000;
    offsets.add(dateParts(new Date(probe), timezone) - probe);
  }
  const candidates = [...offsets]
    .map((offset) => target - offset)
    .filter((instant) => dateParts(new Date(instant), timezone) === target);
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? 'This time occurs twice during a clock change. HR must use the API with an explicit UTC offset.'
        : 'This time does not exist during the company timezone clock change.',
    );
  return new Date(candidates[0]).toISOString();
}

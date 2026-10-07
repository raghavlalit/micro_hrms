import type { AttendanceRow, AttendanceRules } from './attendance.types';
import { companyToday } from '../holidays/holiday-calendar';

export function monthDates(month: string): string[] {
  const [year, number] = month.split('-').map(Number);
  const days = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from(
    { length: days },
    (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`,
  );
}
export function weekday(date: string): number {
  return new Date(date + 'T12:00:00Z').getUTCDay();
}
export function localMinutes(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(instant);
  return (
    Number(parts.find((part) => part.type === 'hour')!.value) * 60 +
    Number(parts.find((part) => part.type === 'minute')!.value)
  );
}
export function calculateAttendance(
  rules: AttendanceRules,
  checkIn: Date,
  checkOut: Date | null,
) {
  const [hour, minute] = rules.start_time.split(':').map(Number);
  const late = Math.max(
    0,
    localMinutes(checkIn, rules.timezone) -
      hour * 60 -
      minute -
      rules.late_grace_minutes,
  );
  const worked = checkOut
    ? Math.floor((checkOut.getTime() - checkIn.getTime()) / 60000)
    : 0;
  // Working on an off-day retains its calendar classification and recorded hours.
  const status = !checkOut
    ? 'pending'
    : rules.holiday
      ? 'holiday'
      : rules.weekly_off
        ? 'weekly_off'
        : worked >= rules.full_day_minutes
          ? 'present'
          : worked >= rules.half_day_minutes
            ? 'half_day'
            : 'absent';
  return {
    status,
    worked_minutes: worked,
    late_minutes: rules.holiday || rules.weekly_off ? 0 : late,
  };
}
export function iso(value: Date | string | null): string | null {
  return value ? new Date(value).toISOString() : null;
}
export function attendanceBaseline(row: AttendanceRow | null) {
  return row
    ? {
        id: row.id,
        revision: row.source_metadata?.revision ?? null,
        updated_at: iso(row.updated_at),
        check_in: iso(row.check_in),
        check_out: iso(row.check_out),
        status: row.status,
        worked_minutes: row.worked_minutes,
      }
    : null;
}
export function displayedStatus(row: AttendanceRow, today: string): string {
  return row.check_in && !row.check_out && row.work_date < today
    ? 'incomplete'
    : row.status;
}
export function sameWorkDate(value: Date, date: string, timezone: string) {
  return companyToday(timezone, value) === date;
}

/** Business dates are YYYY-MM-DD strings, never browser/server-local timestamps. */
export function companyToday(timezone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export interface CalendarHoliday {
  id: string;
  name: string;
  holiday_date: string;
  description: string | null;
  location_id: string | null;
  location_name: string | null;
}

// Existing overlapping legacy entries may still exist. A business day counts once.
export function uniqueHolidayDates(
  holidays: Pick<CalendarHoliday, 'holiday_date'>[],
): Set<string> {
  return new Set(holidays.map((holiday) => holiday.holiday_date));
}

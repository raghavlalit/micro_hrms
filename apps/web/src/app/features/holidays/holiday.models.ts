export interface Holiday {
  id: string;
  name: string;
  holiday_date: string;
  description: string | null;
  location_id: string | null;
  location_name: string | null;
}
export interface HolidayLocation {
  id: string;
  name: string;
  archived_at: string | null;
}
export interface HolidayCalendar {
  year: number;
  timezone: string;
  today: string;
  scope: 'all' | 'company' | 'mine' | 'location';
  location_id: string | null;
  location_name: string | null;
  linked_employee: boolean;
  can_manage: boolean;
  locations: HolidayLocation[];
  items: Holiday[];
  summary: { dates: number; upcoming_dates: number; next_date: string | null };
}
export interface HolidayInput {
  name: string;
  holiday_date: string;
  location_id: string | null;
  description: string;
}
export const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// UTC is used only to lay out date-only values, so device timezones cannot shift cells.
export function calendarCells(year: number, month: number, holidays: Holiday[]) {
  const offset = (new Date(Date.UTC(year, month, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((offset + days) / 7) * 7 }, (_, index) => {
    const day = index - offset + 1;
    const date =
      day > 0 && day <= days
        ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : null;
    return {
      day: date ? day : null,
      date,
      holidays: date ? holidays.filter((holiday) => holiday.holiday_date === date) : [],
    };
  });
}

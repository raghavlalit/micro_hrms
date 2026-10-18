import { Injectable, Provider } from '@angular/core';
import { DateAdapter, MAT_DATE_FORMATS, NativeDateAdapter } from '@angular/material/core';

/** Date-only form values stay YYYY-MM-DD strings, without UTC conversion or API changes. */
@Injectable()
export class CalendarDateAdapter extends DateAdapter<string> {
  private readonly native = new NativeDateAdapter();
  constructor() {
    super();
    this.setLocale('en-GB');
    this.native.setLocale('en-GB');
  }
  private date(value: string) {
    const [year, month, day] = value.split('-').map(Number);
    return this.native.createDate(year, month - 1, day);
  }
  private iso(value: Date) {
    // Material's native ISO serializer uses UTC. Calendar dates need local parts,
    // otherwise selecting midnight in India would send the previous day.
    return `${String(value.getFullYear()).padStart(4, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  }
  getYear(value: string) {
    return Number(value.slice(0, 4));
  }
  getMonth(value: string) {
    return Number(value.slice(5, 7)) - 1;
  }
  getDate(value: string) {
    return Number(value.slice(8, 10));
  }
  getDayOfWeek(value: string) {
    return this.native.getDayOfWeek(this.date(value));
  }
  getMonthNames(style: 'long' | 'short' | 'narrow') {
    return this.native.getMonthNames(style);
  }
  getDateNames() {
    return this.native.getDateNames();
  }
  getDayOfWeekNames(style: 'long' | 'short' | 'narrow') {
    return this.native.getDayOfWeekNames(style);
  }
  getYearName(value: string) {
    return value.slice(0, 4);
  }
  getFirstDayOfWeek() {
    return 1;
  }
  getNumDaysInMonth(value: string) {
    return this.native.getNumDaysInMonth(this.date(value));
  }
  clone(value: string) {
    return value;
  }
  createDate(year: number, month: number, day: number) {
    return this.iso(this.native.createDate(year, month, day));
  }
  today() {
    return this.iso(this.native.today());
  }
  parse(value: unknown): string | null {
    if (value === null || value === undefined || value === '') return null;
    return typeof value === 'string' && this.isValid(value.trim()) ? value.trim() : this.invalid();
  }
  override deserialize(value: unknown) {
    return this.parse(value);
  }
  format(value: string, displayFormat: string | Intl.DateTimeFormatOptions) {
    return displayFormat === 'iso' ? value : this.native.format(this.date(value), displayFormat);
  }
  addCalendarYears(value: string, years: number) {
    return this.iso(this.native.addCalendarYears(this.date(value), years));
  }
  addCalendarMonths(value: string, months: number) {
    return this.iso(this.native.addCalendarMonths(this.date(value), months));
  }
  addCalendarDays(value: string, days: number) {
    return this.iso(this.native.addCalendarDays(this.date(value), days));
  }
  toIso8601(value: string) {
    return value;
  }
  isDateInstance(value: unknown) {
    return typeof value === 'string';
  }
  isValid(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    try {
      return this.iso(this.date(value)) === value;
    } catch {
      return false;
    }
  }
  invalid() {
    return 'Invalid date';
  }
}

export const CALENDAR_DATE_PROVIDERS: Provider[] = [
  { provide: DateAdapter, useClass: CalendarDateAdapter },
  {
    provide: MAT_DATE_FORMATS,
    useValue: {
      parse: { dateInput: 'iso' },
      display: {
        dateInput: 'iso',
        monthYearLabel: { year: 'numeric', month: 'short' },
        dateA11yLabel: { year: 'numeric', month: 'long', day: 'numeric' },
        monthYearA11yLabel: { year: 'numeric', month: 'long' },
      },
    },
  },
];

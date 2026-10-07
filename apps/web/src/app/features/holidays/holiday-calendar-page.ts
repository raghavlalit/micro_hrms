import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AppIcon } from '../../shared/ui/app-icon';
import { HolidayApi, holidayError } from './holiday-api.service';
import { Holiday, HolidayCalendar, calendarCells, months } from './holiday.models';
import { HolidayEditorData, HolidayEditorDialog } from './holiday-editor-dialog';

@Component({
  imports: [ReactiveFormsModule, DatePipe, AppIcon, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './holiday-calendar-page.html',
  styleUrl: './holidays.scss',
})
export class HolidayCalendarPage {
  private readonly api = inject(HolidayApi);
  private readonly dialog = inject(MatDialog);
  readonly data = signal<HolidayCalendar | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly month = signal(0);
  readonly view = signal<'calendar' | 'list'>('calendar');
  readonly months = months;
  readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  readonly filters = inject(FormBuilder).nonNullable.group({
    year: [
      new Date().getUTCFullYear(),
      [
        Validators.required,
        Validators.min(1900),
        Validators.max(2200),
        Validators.pattern(/^\d{4}$/),
      ],
    ],
    scope: 'all',
    location_id: '',
  });
  readonly cells = computed(() =>
    this.data() ? calendarCells(this.data()!.year, this.month(), this.data()!.items) : [],
  );
  readonly weeks = computed(() =>
    Array.from({ length: this.cells().length / 7 }, (_, week) =>
      this.cells().slice(week * 7, week * 7 + 7),
    ),
  );
  readonly monthHolidays = computed(
    () =>
      this.data()?.items.filter(
        (holiday) => Number(holiday.holiday_date.slice(5, 7)) === this.month() + 1,
      ) ?? [],
  );
  readonly upcoming = computed(
    () =>
      this.data()
        ?.items.filter((holiday) => holiday.holiday_date >= this.data()!.today)
        .slice(0, 5) ?? [],
  );
  constructor() {
    this.load(true);
  }
  load(initial = false) {
    if (this.loading()) return;
    if (!initial && this.filters.invalid) {
      this.filters.markAllAsTouched();
      return;
    }
    const value = this.filters.getRawValue();
    if (!initial && this.data()?.can_manage && value.scope === 'location' && !value.location_id) {
      this.error.set('Choose a location before applying this filter.');
      return;
    }
    const params: Record<string, string | number> = initial
      ? {}
      : { year: value.year, scope: this.data()?.can_manage ? value.scope : 'mine' };
    if (params['scope'] === 'location') params['location_id'] = value.location_id;
    this.loading.set(true);
    this.error.set('');
    this.api.calendar(params).subscribe({
      next: (data) => {
        this.data.set(data);
        this.filters.patchValue({
          year: data.year,
          scope: data.scope,
          location_id: data.location_id ?? '',
        });
        if (initial) this.month.set(Number(data.today.slice(5, 7)) - 1);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(holidayError(error));
        this.loading.set(false);
      },
    });
  }
  moveMonth(delta: number) {
    this.month.update((value) => Math.max(0, Math.min(11, value + delta)));
  }
  edit(holiday?: Holiday) {
    const data = this.data();
    if (!data?.can_manage) return;
    this.dialog
      .open<HolidayEditorDialog, HolidayEditorData, Holiday>(HolidayEditorDialog, {
        width: '540px',
        maxWidth: '96vw',
        data: {
          holiday,
          locations: data.locations,
          date: `${data.year}-${String(this.month() + 1).padStart(2, '0')}-01`,
          locationId: data.scope === 'location' ? data.location_id : null,
        },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (!saved) return;
        this.success.set('Holiday saved. The calendar has been refreshed.');
        this.filters.controls.year.setValue(Number(saved.holiday_date.slice(0, 4)));
        this.month.set(Number(saved.holiday_date.slice(5, 7)) - 1);
        // Keep the saved holiday visible when editing its year or location.
        this.filters.patchValue({
          scope: saved.location_id ? 'location' : 'company',
          location_id: saved.location_id ?? '',
        });
        this.load();
      });
  }
}

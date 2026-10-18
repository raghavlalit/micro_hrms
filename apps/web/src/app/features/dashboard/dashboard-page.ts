import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { DashboardApi } from './dashboard-api.service';
import { Dashboard } from './dashboard.models';
@Component({
  imports: [RouterLink, DatePipe, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard.scss',
})
export class DashboardPage {
  readonly api = inject(DashboardApi);
  readonly session = inject(SessionService);
  readonly data = signal<Dashboard | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly attendanceCards = [
    { key: 'present', label: 'Present' },
    { key: 'checked_in', label: 'Checked in' },
    { key: 'absent', label: 'Absent' },
    { key: 'on_leave', label: 'On leave' },
    { key: 'pending', label: 'Not recorded yet' },
  ];
  constructor() {
    this.load();
  }
  can(...permissions: string[]) {
    return permissions.some((p) => this.session.user()?.permissions.includes(p));
  }
  // A calendar date has no timezone. Explicit UTC midnight avoids converting
  // the browser's local midnight to the previous date in the UTC date pipe.
  calendarDate(date: string) {
    return date + 'T00:00:00Z';
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.data.set(null);
    this.api.overview().subscribe({
      next: (data) => {
        this.data.set(data);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Unable to load your dashboard. Please try again.');
        this.loading.set(false);
      },
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeaveCalendar } from './leave.models';
@Component({
  imports: [FormsModule, DatePipe, RouterLink, ...MATERIAL_FORM_IMPORTS],
  styleUrl: './leave.scss',
  template: ` <section class="page">
    <header class="page-heading">
      <div>
        <span class="eyebrow">TEAM AVAILABILITY</span>
        <h1>Leave calendar</h1>
        <p>
          Approved time away in your permitted team. Leave reasons and categories stay private here.
        </p>
      </div>
      <a mat-stroked-button routerLink="/leave">Leave balances</a>
    </header>
    @if (error()) {
      <p class="message error" role="alert">{{ error() }}</p>
    }
    <section class="panel filters">
      <mat-form-field appearance="outline"
        ><mat-label>Month</mat-label
        ><input matInput type="month" [(ngModel)]="month" [disabled]="loading()" /></mat-form-field
      ><button mat-flat-button (click)="load()" [disabled]="loading()">Load calendar</button>
    </section>
    @if (loading()) {
      <mat-progress-bar mode="indeterminate" />
    }
    @if (data(); as calendar) {
      <section class="panel">
        <h2>{{ calendar.month }} · Approved leave</h2>
        <div class="calendar-grid">
          @for (day of days(); track day.date) {
            <article class="calendar-day" [class.has-leave]="day.items.length">
              <h3>{{ day.date | date: 'EEE, dd MMM' : 'UTC' }}</h3>
              @for (item of day.items; track item.request_id) {
                <p>
                  <strong>{{ item.name }}</strong
                  ><span>{{
                    item.half === 'full' ? 'Full day' : item.half.toUpperCase() + ' half'
                  }}</span>
                </p>
              } @empty {
                <small class="muted">No approved leave</small>
              }
            </article>
          }
        </div>
      </section>
    }
  </section>`,
})
export class LeaveCalendarPage {
  private readonly api = inject(LeaveApi);
  readonly data = signal<LeaveCalendar | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  month = '';
  constructor() {
    this.load();
  }
  load() {
    if (this.loading()) return;
    if (this.month && !/^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(this.month)) {
      this.error.set('Choose a valid month');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api.calendar(this.month).subscribe({
      next: (result) => {
        this.data.set(result);
        this.month = result.month;
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(leaveError(error));
        this.data.set(null);
        this.loading.set(false);
      },
    });
  }
  days() {
    const data = this.data();
    if (!data) return [];
    const count = new Date(
      Number(data.month.slice(0, 4)),
      Number(data.month.slice(5, 7)),
      0,
    ).getDate();
    return Array.from({ length: count }, (_, index) => {
      const date = data.month + '-' + String(index + 1).padStart(2, '0');
      return { date, items: data.items.filter((item) => item.date === date) };
    });
  }
}

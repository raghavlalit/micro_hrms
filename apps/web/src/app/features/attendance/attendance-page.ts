import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { AttendanceApi, attendanceError } from './attendance-api.service';
import {
  AttendanceCalendar,
  AttendanceDay,
  AttendancePerson,
  displayTime,
} from './attendance.models';
import { AttendanceEditData, AttendanceEditDialog } from './attendance-edit-dialog';
@Component({
  imports: [FormsModule, DatePipe, RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './attendance-page.html',
  styleUrl: './attendance.scss',
})
export class AttendancePage {
  private readonly api = inject(AttendanceApi);
  private readonly dialog = inject(MatDialog);
  readonly session = inject(SessionService);
  readonly data = signal<AttendanceCalendar | null>(null);
  readonly people = signal<AttendancePerson[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly peopleBusy = signal(false);
  readonly time = displayTime;
  month = '';
  employeeId = '';
  search = '';
  peoplePage = 1;
  peopleTotal = 0;
  mode = this.session.user()?.permissions.includes('attendance.manage')
    ? 'team'
    : this.selfAllowed()
      ? 'self'
      : 'team';
  selfAllowed() {
    return !!this.session.user()?.permissions.includes('attendance.self');
  }
  teamAllowed() {
    return !!this.session
      .user()
      ?.permissions.some((p) => ['attendance.manage', 'attendance.approve.team'].includes(p));
  }
  constructor() {
    if (this.mode === 'self') this.load();
    if (this.teamAllowed()) this.loadPeople();
  }
  loadPeople() {
    if (this.peopleBusy()) return;
    this.peopleBusy.set(true);
    this.api.people(this.search, this.peoplePage).subscribe({
      next: (result) => {
        this.people.set(result.items);
        this.peopleTotal = result.total;
        this.peopleBusy.set(false);
        if (this.mode === 'team' && !result.items.some((person) => person.id === this.employeeId)) {
          this.employeeId = result.items[0]?.id ?? '';
          this.data.set(null);
          if (this.employeeId) this.load();
        }
      },
      error: (error) => {
        this.error.set(attendanceError(error));
        this.peopleBusy.set(false);
      },
    });
  }
  searchPeople() {
    this.peoplePage = 1;
    this.loadPeople();
  }
  peopleStep(step: number) {
    this.peoplePage += step;
    this.loadPeople();
  }
  switchMode() {
    this.data.set(null);
    this.error.set('');
    if (this.mode === 'team' && !this.employeeId) this.employeeId = this.people()[0]?.id ?? '';
    this.load();
  }
  load() {
    if (this.loading() || (this.mode === 'team' && !this.employeeId)) return;
    if (this.month && !/^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/.test(this.month)) {
      this.error.set('Choose a valid month.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.api
      .calendar(this.month || undefined, this.mode === 'team' ? this.employeeId : undefined)
      .subscribe({
        next: (data) => {
          this.data.set(data);
          this.month = data.month;
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(attendanceError(error));
          this.data.set(null);
          this.loading.set(false);
        },
      });
  }
  check(out: boolean) {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.check(out).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(out ? 'Checked out successfully.' : 'Checked in successfully.');
        this.load();
      },
      error: (error) => {
        this.error.set(attendanceError(error));
        this.loading.set(false);
      },
    });
  }
  edit(day: AttendanceDay, manual: boolean) {
    const calendar = this.data();
    if (!calendar) return;
    this.dialog
      .open<AttendanceEditDialog, AttendanceEditData, boolean>(AttendanceEditDialog, {
        width: '560px',
        maxWidth: '96vw',
        data: { day, manual, employeeId: calendar.employee.id, name: calendar.employee.name },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.success.set(manual ? 'Attendance adjusted.' : 'Correction submitted for review.');
          this.load();
        }
      });
  }
  hours(minutes: number) {
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  }
}

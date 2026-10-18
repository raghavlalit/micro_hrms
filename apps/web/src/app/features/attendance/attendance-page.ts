import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { AttendanceApi, attendanceError } from './attendance-api.service';
import { AttendanceCalendar, AttendanceDay, displayTime } from './attendance.models';
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
  private readonly route = inject(ActivatedRoute);
  readonly backQuery = this.route.snapshot.queryParams;
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly time = displayTime;
  month = this.route.snapshot.queryParamMap.get('month') ?? '';
  employeeId = this.route.snapshot.paramMap.get('id') ?? '';
  mode = this.employeeId ? 'team' : 'self';
  // Calendar dates have no timezone. Anchor them to UTC before the UTC date pipe
  // formats them, rather than letting Angular interpret browser-local midnight.
  calendarDate(date: string) {
    return `${date}T00:00:00Z`;
  }
  selfAllowed() {
    return !!this.session.user()?.permissions.includes('attendance.self');
  }
  teamAllowed() {
    return !!this.session
      .user()
      ?.permissions.some((p) => ['attendance.manage', 'attendance.approve.team'].includes(p));
  }
  constructor() {
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

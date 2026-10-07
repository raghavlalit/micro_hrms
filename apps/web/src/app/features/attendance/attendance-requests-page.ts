import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { AttendanceApi, attendanceError } from './attendance-api.service';
import { Correction, displayTime } from './attendance.models';
import { AttendanceReviewDialog } from './attendance-review-dialog';
@Component({
  imports: [FormsModule, RouterLink, MatPaginatorModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './attendance-requests-page.html',
  styleUrl: './attendance.scss',
})
export class AttendanceRequestsPage {
  private readonly api = inject(AttendanceApi);
  private readonly dialog = inject(MatDialog);
  readonly session = inject(SessionService);
  readonly items = signal<Correction[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly time = displayTime;
  readonly canReview = !!this.session
    .user()
    ?.permissions.some((p) => ['attendance.manage', 'attendance.approve.team'].includes(p));
  readonly canSelf = !!this.session.user()?.permissions.includes('attendance.self');
  scope = this.canReview ? 'review' : 'mine';
  status = 'pending';
  page = 0;
  total = 0;
  constructor() {
    this.load();
  }
  apply() {
    this.page = 0;
    this.load();
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.corrections(this.scope, this.status, this.page + 1).subscribe({
      next: (result) => {
        this.items.set(result.items);
        this.total = result.total;
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(attendanceError(error));
        this.items.set([]);
        this.total = 0;
        this.loading.set(false);
      },
    });
  }
  paginate(event: PageEvent) {
    this.page = event.pageIndex;
    this.load();
  }
  review(row: Correction) {
    this.dialog
      .open(AttendanceReviewDialog, { width: '540px', maxWidth: '96vw', data: row })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.success.set('Correction reviewed.');
          this.load();
        }
      });
  }
}

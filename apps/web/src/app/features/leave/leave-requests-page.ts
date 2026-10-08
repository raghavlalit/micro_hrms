import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeaveRequest } from './leave.models';
import { LeaveDecisionDialog } from './leave-decision-dialog';
@Component({
  imports: [FormsModule, DatePipe, RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './leave-requests-page.html',
  styleUrl: './leave.scss',
})
export class LeaveRequestsPage {
  private readonly api = inject(LeaveApi);
  private readonly dialog = inject(MatDialog);
  readonly session = inject(SessionService);
  readonly rows = signal<LeaveRequest[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selfAllowed = !!this.session.user()?.permissions.includes('leave.self');
  readonly reviewAllowed = !!this.session
    .user()
    ?.permissions.some((p) => ['leave.manage', 'leave.approve.team'].includes(p));
  scope = this.reviewAllowed ? 'review' : 'mine';
  status = 'pending';
  page = 1;
  total = 0;
  constructor() {
    this.load();
  }
  load(reset = false) {
    if (this.loading()) return;
    if (reset) this.page = 1;
    this.loading.set(true);
    this.error.set('');
    this.api.requests(this.scope, this.status, this.page).subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.total = result.total;
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(leaveError(error));
        this.rows.set([]);
        this.loading.set(false);
      },
    });
  }
  step(step: number) {
    this.page += step;
    this.load();
  }
  decide(request: LeaveRequest, cancel = false) {
    this.dialog
      .open(LeaveDecisionDialog, { data: { request, cancel }, width: '600px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.success.set(cancel ? 'Leave cancelled.' : 'Review saved.');
          this.load();
        }
      });
  }
}

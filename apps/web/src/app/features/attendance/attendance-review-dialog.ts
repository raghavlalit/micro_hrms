import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AttendanceApi, attendanceError } from './attendance-api.service';
import { Correction, displayTime } from './attendance.models';
@Component({
  imports: [FormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  template: ` <h2 mat-dialog-title>Review correction</h2>
    <form #form="ngForm" (ngSubmit)="form.valid && save()">
      <mat-dialog-content
        ><p>
          <strong>{{ request.employee_name }}</strong> · {{ request.work_date }}
        </p>
        <p class="muted">
          {{ time(request.check_in, request.timezone) }}–{{
            time(request.check_out, request.timezone)
          }}
          · {{ request.timezone }}
        </p>
        <p class="request-reason">{{ request.reason }}</p>
        <mat-form-field appearance="outline"
          ><mat-label>Decision</mat-label
          ><mat-select name="decision" [(ngModel)]="decision" required
            ><mat-option value="approved">Approve</mat-option
            ><mat-option value="rejected">Reject</mat-option></mat-select
          ></mat-form-field
        ><mat-form-field appearance="outline"
          ><mat-label>Review comment (optional)</mat-label
          ><textarea
            matInput
            name="comment"
            [(ngModel)]="comment"
            rows="3"
            maxlength="500"
          ></textarea>
        </mat-form-field>
        <p class="muted">
          Approval replaces the day's times and recalculates status. If attendance has changed,
          reject this request and ask for a fresh one.
        </p>
        @if (error()) {
          <p role="alert" class="message error">{{ error() }}</p>
        }
        @if (busy()) {
          <mat-progress-bar mode="indeterminate" aria-label="Saving review" />
        }</mat-dialog-content
      ><mat-dialog-actions align="end"
        ><button mat-button type="button" [disabled]="busy()" (click)="dialog.close()">
          Cancel</button
        ><button mat-flat-button type="submit" [disabled]="busy()">
          Save decision
        </button></mat-dialog-actions
      >
    </form>`,
  styleUrl: './attendance.scss',
})
export class AttendanceReviewDialog {
  readonly request = inject<Correction>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<AttendanceReviewDialog>);
  private readonly api = inject(AttendanceApi);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly time = displayTime;
  decision = 'approved';
  comment = '';
  save() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.dialog.disableClose = true;
    this.api.review(this.request.id, this.decision, this.comment.trim()).subscribe({
      next: () => this.dialog.close(true),
      error: (error) => {
        this.error.set(attendanceError(error));
        this.busy.set(false);
        this.dialog.disableClose = false;
      },
    });
  }
}

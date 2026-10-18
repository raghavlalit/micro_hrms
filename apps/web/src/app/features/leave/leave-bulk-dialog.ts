import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeaveAssignmentApi } from './leave-assignment-api.service';
import { AssignmentFilters, AssignmentJob } from './leave-assignment.models';
import { LeavePolicyOption } from './leave.models';
export interface BulkAssignmentData {
  filters: AssignmentFilters;
  allMatching: boolean;
  ids: string[];
  count: number;
}
@Component({
  imports: [FormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  styleUrl: './leave.scss',
  template: `
    <h2 mat-dialog-title>Assign leave · {{ data.filters.year }}</h2>
    <mat-dialog-content>
      <p>
        {{ preview()?.total_units ?? data.count }} employees selected{{
          data.allMatching ? ' across all matching pages' : ''
        }}.
      </p>
      @if (error()) {
        <p role="alert" class="message error">{{ error() }}</p>
      }
      @if (preview(); as job) {
        <p>
          <strong>{{ job.policy_name }}</strong> · {{ job.credited }} days per eligible employee
        </p>
        <p>Reason: {{ job.reason }}</p>
        <p>
          <strong>{{ job.counts['assignable'] }}</strong> ready to assign ·
          {{ job.counts['skipped'] }} already assigned · {{ job.counts['rejected'] }} not eligible.
        </p>
        <p>
          Existing entitlements, usage and history are preserved. Eligibility is checked again when
          the job runs. Preview expires in 30 minutes.
        </p>
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              @for (row of job.items; track row.id) {
                <tr>
                  <td>{{ row.name }} · {{ row.employee_code }}</td>
                  <td>{{ label(row.status) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <div class="pagination">
          <button mat-button (click)="page(-1)" [disabled]="previewPage === 1 || busy()">
            Previous</button
          ><span>Page {{ previewPage }}</span
          ><button
            mat-button
            (click)="page(1)"
            [disabled]="previewPage * 50 >= job.total || busy()"
          >
            Next
          </button>
        </div>
      } @else {
        <form
          #form="ngForm"
          (ngSubmit)="prepare(form)"
          id="bulk-assignment-form"
          class="leave-form"
        >
          <mat-form-field appearance="outline"
            ><mat-label>Leave policy</mat-label
            ><mat-select
              name="policy"
              [(ngModel)]="policyId"
              required
              (selectionChange)="choosePolicy()"
            >
              @for (policy of policies(); track policy.id) {
                <mat-option [value]="policy.id">{{ policy.name }}</mat-option>
              }
            </mat-select></mat-form-field
          >
          <mat-form-field appearance="outline"
            ><mat-label>Credit (days)</mat-label
            ><input
              matInput
              type="number"
              name="credited"
              [(ngModel)]="credited"
              min="0"
              max="366"
              step="0.01"
              required
          /></mat-form-field>
          <mat-form-field appearance="outline"
            ><mat-label>Reason</mat-label
            ><textarea
              matInput
              name="reason"
              [(ngModel)]="reason"
              minlength="3"
              maxlength="500"
              required
            ></textarea>
          </mat-form-field>
          <p>
            Assign one leave type per batch. Use the employee balance screen for carry-forward or
            adjustments.
          </p>
        </form>
      }
      @if (busy()) {
        <mat-progress-bar mode="indeterminate" />
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-button mat-dialog-close [disabled]="busy()">Cancel</button>
      @if (preview(); as job) {
        <button mat-button (click)="preview.set(null)" [disabled]="busy()">Change</button
        ><button
          mat-flat-button
          (click)="confirm()"
          [disabled]="busy() || !job.counts['assignable']"
        >
          Confirm assignment
        </button>
      } @else {
        <button mat-flat-button type="submit" form="bulk-assignment-form" [disabled]="busy()">
          Preview assignment
        </button>
      }
    </mat-dialog-actions>
  `,
})
export class LeaveBulkDialog {
  readonly data = inject<BulkAssignmentData>(MAT_DIALOG_DATA);
  private readonly api = inject(LeaveAssignmentApi);
  private readonly ref = inject(MatDialogRef<LeaveBulkDialog>);
  readonly policies = signal<LeavePolicyOption[]>([]);
  readonly preview = signal<AssignmentJob | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  policyId = '';
  credited = 0;
  reason = '';
  previewPage = 1;
  constructor() {
    inject(LeaveApi)
      .policies()
      .subscribe({
        next: (rows) => this.policies.set(rows),
        error: (e) => this.error.set(leaveError(e)),
      });
  }
  choosePolicy() {
    const policy = this.policies().find((p) => p.id === this.policyId);
    this.credited = policy?.balance_controlled ? Number(policy.annual_entitlement) : 0;
  }
  label(status: string) {
    return (
      (
        { assignable: 'Ready', skipped: 'Already assigned', rejected: 'Not eligible' } as Record<
          string,
          string
        >
      )[status] ?? status
    );
  }
  prepare(form: NgForm) {
    if (form.invalid || this.reason.trim().length < 3 || this.busy()) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.previewPage = 1;
    const filters = Object.fromEntries(
      Object.entries(this.data.filters).filter(([, v]) => v !== '' && v !== undefined),
    );
    this.api
      .preview({
        operation_id: crypto.randomUUID(),
        filters,
        year: this.data.filters.year,
        policy_id: this.policyId,
        credited: this.credited,
        carry_forward: 0,
        reason: this.reason.trim(),
        all_matching: this.data.allMatching,
        ...(this.data.allMatching ? {} : { employee_ids: this.data.ids }),
      })
      .subscribe({
        next: (job) => {
          this.preview.set(job);
          this.busy.set(false);
        },
        error: (e) => this.failed(e),
      });
  }
  page(step: number) {
    this.busy.set(true);
    this.api.job(this.preview()!.id, this.previewPage + step).subscribe({
      next: (job) => {
        this.previewPage += step;
        this.preview.set(job);
        this.busy.set(false);
      },
      error: (e) => this.failed(e),
    });
  }
  confirm() {
    if (this.busy() || !this.preview()) return;
    this.busy.set(true);
    this.ref.disableClose = true;
    this.api
      .confirm(this.preview()!.id)
      .subscribe({ next: (job) => this.ref.close(job), error: (e) => this.failed(e) });
  }
  private failed(e: unknown) {
    this.error.set(leaveError(e));
    this.busy.set(false);
    this.ref.disableClose = false;
  }
}

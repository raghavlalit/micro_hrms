import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeavePolicyOption } from './leave.models';
export interface LeaveAdminData {
  employeeId: string;
  name: string;
  year: number;
  balanceId?: string;
}
@Component({
  imports: [FormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './leave-admin-dialog.html',
  styleUrl: './leave.scss',
})
export class LeaveAdminDialog {
  readonly data = inject<LeaveAdminData>(MAT_DIALOG_DATA);
  private readonly api = inject(LeaveApi);
  private readonly ref = inject(MatDialogRef<LeaveAdminDialog>);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly policies = signal<LeavePolicyOption[]>([]);
  policyId = '';
  credited = 0;
  carry = 0;
  units = 0;
  reason = '';
  private readonly operationId = crypto.randomUUID();
  constructor() {
    if (!this.data.balanceId)
      this.api
        .policies()
        .subscribe({
          next: (rows) => this.policies.set(rows),
          error: (error) => this.error.set(leaveError(error)),
        });
  }
  choosePolicy() {
    const policy = this.policies().find((p) => p.id === this.policyId);
    this.credited = policy?.balance_controlled ? Number(policy.annual_entitlement) : 0;
    this.carry = 0;
  }
  save(form: NgForm) {
    if (form.invalid || this.reason.trim().length < 3 || this.busy()) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.ref.disableClose = true;
    const request = this.data.balanceId
      ? this.api.adjust(this.data.balanceId, {
          units: this.units,
          reason: this.reason.trim(),
          operation_id: this.operationId,
        })
      : this.api.setup(this.data.employeeId, {
          policy_id: this.policyId,
          year: this.data.year,
          credited: this.credited,
          carry_forward: this.carry,
          reason: this.reason.trim(),
        });
    request.subscribe({
      next: () => this.ref.close(true),
      error: (error) => {
        this.error.set(leaveError(error));
        this.busy.set(false);
        this.ref.disableClose = false;
      },
    });
  }
}

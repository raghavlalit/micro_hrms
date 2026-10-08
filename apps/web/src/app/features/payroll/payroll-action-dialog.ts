import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PayrollApi, payrollError } from './payroll-api.service';
import { PayrollItem, PayrollLine, PayrollRun } from './payroll.models';
export interface PayrollActionData {
  action: 'calculate' | 'review' | 'lock' | 'publish' | 'adjust';
  run: PayrollRun;
  item?: PayrollItem;
  line?: PayrollLine;
}
@Component({
  imports: [FormsModule, MatDialogModule, MatCheckboxModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './payroll-action-dialog.html',
  styleUrl: './payroll.scss',
})
export class PayrollActionDialog {
  readonly data = inject<PayrollActionData>(MAT_DIALOG_DATA);
  private readonly api = inject(PayrollApi);
  private readonly ref = inject(MatDialogRef<PayrollActionDialog>);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly operationId = crypto.randomUUID();
  reason = '';
  discard = false;
  name = '';
  kind = 'earning';
  amount = this.data.line?.amount ?? '';
  readonly title = {
    calculate: 'Calculate payroll',
    review: 'Mark payroll reviewed',
    lock: 'Lock payroll',
    publish: 'Publish payslips',
    adjust: this.data.line ? 'Edit manual adjustment' : 'Add manual adjustment',
  }[this.data.action];
  save(form: NgForm) {
    if (form.invalid || this.busy() || this.reason.trim().length < 3) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.ref.disableClose = true;
    this.error.set('');
    const base = {
      reason: this.reason.trim(),
      revision: this.data.run.calculation_config.revision,
      calculation_version: this.data.run.calculation_version,
    };
    let request;
    if (this.data.action === 'adjust')
      request = this.data.line
        ? this.api.editAdjustment(this.data.line.id, {
            ...base,
            amount: this.amount.trim(),
            expected_amount: this.data.line.amount,
          })
        : this.api.adjust(this.data.item!.id, {
            ...base,
            name: this.name.trim(),
            kind: this.kind,
            amount: this.amount.trim(),
            operation_id: this.operationId,
          });
    else
      request = this.api.action(
        this.data.run.id,
        this.data.action,
        this.data.action === 'calculate'
          ? { reason: base.reason, revision: base.revision, discard_adjustments: this.discard }
          : base,
      );
    request.subscribe({
      next: () => this.ref.close(true),
      error: (error) => {
        this.error.set(payrollError(error));
        this.busy.set(false);
        this.ref.disableClose = false;
      },
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PayrollApi, payrollError } from './payroll-api.service';
import { SalaryComponent, SalaryLine, SalaryRevision } from './payroll.models';
@Component({
  imports: [FormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './salary-dialog.html',
  styleUrl: './payroll.scss',
})
export class SalaryDialog {
  readonly data = inject<{ employeeId: string; name: string; revision?: SalaryRevision }>(
    MAT_DIALOG_DATA,
  );
  private readonly api = inject(PayrollApi);
  private readonly ref = inject(MatDialogRef<SalaryDialog>);
  readonly components = signal<SalaryComponent[]>([]);
  readonly error = signal('');
  readonly busy = signal(false);
  effectiveFrom = '';
  reason = '';
  lines: SalaryLine[] = this.data.revision?.lines
    .filter((line) => line.amount !== '0.00')
    .map((line) => ({ component_id: line.component_id, amount: line.amount })) ?? [
    { component_id: '', amount: '0.00' },
  ];
  constructor() {
    this.api
      .components()
      .subscribe({
        next: (rows) => this.components.set(rows.filter((row) => row.is_active)),
        error: (error) => this.error.set(payrollError(error)),
      });
  }
  add() {
    if (this.lines.length < 50) this.lines.push({ component_id: '', amount: '0.00' });
  }
  save(form: NgForm) {
    if (form.invalid || this.busy() || this.reason.trim().length < 3) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.ref.disableClose = true;
    const body = {
      lines: this.lines.map((line) => ({
        component_id: line.component_id,
        amount: line.amount.trim(),
      })),
      reason: this.reason.trim(),
    };
    const request = this.data.revision
      ? this.api.editSalary(this.data.revision.id, body)
      : this.api.createSalary(this.data.employeeId, {
          ...body,
          effective_from: this.effectiveFrom,
        });
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

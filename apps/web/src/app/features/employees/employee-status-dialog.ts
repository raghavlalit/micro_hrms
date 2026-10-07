import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { Employee, employeeStatuses } from './employee.models';
@Component({
  imports: [FormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './employee-status-dialog.html',
  styleUrl: './employees.scss',
})
export class EmployeeStatusDialog {
  readonly employee = inject<Employee>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<EmployeeStatusDialog>);
  readonly statuses = employeeStatuses.filter(
    (status) => status !== 'invited' || this.employee.status === 'invited',
  );
  status = this.employee.status;
  reason = '';
  notice_date = this.employee.notice_date ?? null;
  termination_date = this.employee.termination_date ?? null;
  submit() {
    this.dialog.close({
      status: this.status,
      reason: this.reason,
      notice_date: this.status === 'on_notice' ? this.notice_date : null,
      termination_date: this.status === 'terminated' ? this.termination_date : null,
    });
  }
}

import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { Employee } from './employee.models';
@Component({
  imports: [FormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './employee-invite-dialog.html',
})
export class EmployeeInviteDialog {
  readonly employee = inject<Employee>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<EmployeeInviteDialog>);
  role = 'employee';
}

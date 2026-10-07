import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AttendanceApi, attendanceError } from './attendance-api.service';
import { AttendanceDay, companyTimeToIso, displayTime } from './attendance.models';
export interface AttendanceEditData {
  day: AttendanceDay;
  employeeId: string;
  manual: boolean;
  name: string;
}
@Component({
  imports: [ReactiveFormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './attendance-edit-dialog.html',
  styleUrl: './attendance.scss',
})
export class AttendanceEditDialog {
  readonly data = inject<AttendanceEditData>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<AttendanceEditDialog>);
  private readonly api = inject(AttendanceApi);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    mode: 'times',
    start: this.data.day.check_in
      ? displayTime(this.data.day.check_in, this.data.day.timezone)
      : '',
    end: this.data.day.check_out
      ? displayTime(this.data.day.check_out, this.data.day.timezone)
      : '',
    reason: [
      '',
      [
        Validators.required,
        Validators.minLength(3),
        Validators.maxLength(500),
        Validators.pattern(/\S.{1,}\S/),
      ],
    ],
  });
  save() {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    let start: string | null = null,
      end: string | null = null;
    try {
      if (!this.data.manual || value.mode === 'times') {
        start = companyTimeToIso(this.data.day.work_date, value.start, this.data.day.timezone);
        end = companyTimeToIso(this.data.day.work_date, value.end, this.data.day.timezone);
        if (end <= start) throw new Error('Check-out must be after check-in.');
      }
    } catch (error) {
      this.error.set(attendanceError(error));
      return;
    }
    const body = { check_in: start, check_out: end, reason: value.reason.trim() };
    const request = this.data.manual
      ? this.api.adjust(this.data.employeeId, this.data.day.work_date, {
          ...body,
          mode: value.mode,
        })
      : this.api.submit({ ...body, work_date: this.data.day.work_date });
    this.busy.set(true);
    this.error.set('');
    this.dialog.disableClose = true;
    request.subscribe({
      next: () => this.dialog.close(true),
      error: (error) => {
        this.error.set(attendanceError(error));
        this.busy.set(false);
        this.dialog.disableClose = false;
      },
    });
  }
}

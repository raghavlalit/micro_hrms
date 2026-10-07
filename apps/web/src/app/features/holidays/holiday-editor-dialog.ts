import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { Holiday, HolidayLocation } from './holiday.models';
import { HolidayApi, holidayError } from './holiday-api.service';
export interface HolidayEditorData {
  holiday?: Holiday;
  locations: HolidayLocation[];
  date: string;
  locationId: string | null;
}
@Component({
  imports: [ReactiveFormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './holiday-editor-dialog.html',
  styleUrl: './holidays.scss',
})
export class HolidayEditorDialog {
  readonly data = inject<HolidayEditorData>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<HolidayEditorDialog, Holiday>);
  private readonly api = inject(HolidayApi);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly locations = this.data.locations.filter(
    (location) => !location.archived_at || location.id === this.data.holiday?.location_id,
  );
  readonly form = inject(FormBuilder).nonNullable.group({
    name: [
      this.data.holiday?.name ?? '',
      [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)],
    ],
    holiday_date: [
      this.data.holiday?.holiday_date ?? this.data.date,
      [Validators.required, Validators.pattern(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)],
    ],
    location_id: [
      this.data.holiday ? (this.data.holiday.location_id ?? '') : (this.data.locationId ?? ''),
    ],
    description: [this.data.holiday?.description ?? '', Validators.maxLength(500)],
  });
  save() {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    this.busy.set(true);
    this.error.set('');
    this.dialog.disableClose = true;
    this.api
      .save(
        {
          name: value.name.trim(),
          holiday_date: value.holiday_date,
          location_id: value.location_id || null,
          description: value.description.trim(),
        },
        this.data.holiday?.id,
      )
      .subscribe({
        next: (holiday) => this.dialog.close(holiday),
        error: (error) => {
          this.error.set(holidayError(error));
          this.busy.set(false);
          this.dialog.disableClose = false;
        },
      });
  }
}

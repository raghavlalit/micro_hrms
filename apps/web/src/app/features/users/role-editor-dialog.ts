import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { AccessApi, accessError } from './access-api.service';
import { AccessRole, Permission } from './access.models';

@Component({
  imports: [ReactiveFormsModule, MatDialogModule, MatCheckboxModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './role-editor-dialog.html',
  styleUrl: './users.scss',
})
export class RoleEditorDialog {
  readonly data = inject<{ role?: AccessRole; permissions: Permission[] }>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<RoleEditorDialog>);
  readonly session = inject(SessionService);
  private readonly api = inject(AccessApi);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    code: [
      this.data.role?.code ?? '',
      [Validators.required, Validators.pattern(/^[a-z][a-z0-9_]{1,39}$/)],
    ],
    name: [
      this.data.role?.name ?? '',
      [Validators.required, Validators.maxLength(80), Validators.pattern(/\S/)],
    ],
    permission_codes: [this.data.role?.permission_codes ?? ([] as string[]), Validators.required],
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
  toggle(code: string, checked: boolean) {
    const control = this.form.controls.permission_codes;
    control.setValue(
      checked ? [...control.value, code] : control.value.filter((value) => value !== code),
    );
    control.markAsTouched();
  }
  save() {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const body = {
      name: value.name.trim(),
      permission_codes: value.permission_codes,
      reason: value.reason.trim(),
      ...(!this.data.role ? { code: value.code } : {}),
    };
    this.busy.set(true);
    this.error.set('');
    this.dialog.disableClose = true;
    this.api.saveRole(this.data.role?.id, body).subscribe({
      next: () => this.dialog.close(true),
      error: (error) => {
        this.error.set(accessError(error));
        this.busy.set(false);
        this.dialog.disableClose = false;
      },
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AccessApi, accessError } from './access-api.service';
import { AccessRole, AccessResult, CompanyUser } from './access.models';

export interface UserActionData {
  action: 'invite' | 'roles' | 'status' | 'reinvite';
  user?: CompanyUser;
  roles: AccessRole[];
}
@Component({
  imports: [ReactiveFormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './user-action-dialog.html',
  styleUrl: './users.scss',
})
export class UserActionDialog {
  readonly data = inject<UserActionData>(MAT_DIALOG_DATA);
  readonly dialog = inject(MatDialogRef<UserActionDialog, AccessResult>);
  private readonly api = inject(AccessApi);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly form = inject(FormBuilder).nonNullable.group({
    display_name: [
      '',
      this.data.action === 'invite'
        ? [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]
        : [],
    ],
    email: [
      '',
      this.data.action === 'invite'
        ? [Validators.required, Validators.email, Validators.maxLength(254)]
        : [],
    ],
    role_ids: [
      this.data.user?.roles.map((role) => role.id) ?? ([] as string[]),
      ['invite', 'roles'].includes(this.data.action) ? [Validators.required] : [],
    ],
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
  readonly title =
    this.data.action === 'invite'
      ? 'Invite user'
      : this.data.action === 'roles'
        ? 'Change user roles'
        : this.data.action === 'reinvite'
          ? 'Reissue invitation'
          : this.data.user?.status === 'disabled'
            ? 'Enable account'
            : 'Disable account';
  save() {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request =
      this.data.action === 'invite'
        ? this.api.invite({
            ...value,
            display_name: value.display_name.trim(),
            email: value.email.trim().toLowerCase(),
            reason: value.reason.trim(),
          })
        : this.data.action === 'roles'
          ? this.api.roles(this.data.user!.id, value.role_ids, value.reason.trim())
          : this.data.action === 'reinvite'
            ? this.api.reinvite(this.data.user!.id, value.reason.trim())
            : this.api.status(
                this.data.user!.id,
                this.data.user!.status === 'disabled' ? 'enabled' : 'disabled',
                value.reason.trim(),
              );
    this.busy.set(true);
    this.error.set('');
    this.dialog.disableClose = true;
    request.subscribe({
      next: (result) => this.dialog.close(result),
      error: (error) => {
        this.busy.set(false);
        this.dialog.disableClose = false;
        this.error.set(accessError(error));
      },
    });
  }
}

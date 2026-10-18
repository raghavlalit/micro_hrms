import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthLayout } from '../../layouts/auth-layout';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PasswordRecoveryApi, recoveryError } from './password-recovery-api.service';
@Component({
  imports: [FormsModule, RouterLink, AuthLayout, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './forgot-password-page.html',
  styleUrl: './auth-page.scss',
})
export class ForgotPasswordPage {
  private readonly api = inject(PasswordRecoveryApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly message = signal('');
  readonly error = signal('');
  company = '';
  email = '';
  submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .request(this.company, this.email)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.message.set(result.message);
          this.done.set(true);
          this.busy.set(false);
        },
        error: (error) => {
          this.error.set(recoveryError(error));
          this.busy.set(false);
        },
      });
  }
}

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { AuthLayout } from '../../layouts/auth-layout';
import { SessionService } from '../../core/auth/session.service';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PasswordRecoveryApi, recoveryError } from './password-recovery-api.service';
@Component({
  imports: [FormsModule, RouterLink, AuthLayout, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './reset-password-page.html',
  styleUrl: './auth-page.scss',
})
export class ResetPasswordPage {
  private readonly api = inject(PasswordRecoveryApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private pending?: Subscription;
  private token = '';
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly error = signal('');
  readonly hasToken = signal(false);
  password = '';
  confirmation = '';
  constructor() {
    this.route.fragment.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((fragment) => {
      if (!fragment) return; // Removing the URL credential must preserve the in-memory form.
      this.pending?.unsubscribe();
      this.busy.set(false);
      this.done.set(false);
      this.error.set('');
      this.password = this.confirmation = '';
      this.token = fragment;
      this.hasToken.set(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.r\.[0-9a-f]{64}$/.test(
          fragment,
        ),
      );
      // Clear browser history immediately, then synchronize Angular's URL state
      // so reopening even the same email link produces a fresh form.
      window.history.replaceState(window.history.state, '', window.location.pathname);
      void this.router.navigateByUrl('/reset-password', { replaceUrl: true });
    });
  }
  submit() {
    if (this.busy() || !this.hasToken()) return;
    if (this.password !== this.confirmation) {
      this.error.set('Passwords do not match.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.pending = this.api
      .reset(this.token, this.password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.token = '';
          this.password = '';
          this.confirmation = '';
          this.session.user.set(null);
          this.done.set(true);
          this.busy.set(false);
        },
        error: (error) => {
          this.password = '';
          this.confirmation = '';
          this.busy.set(false);
          this.error.set(recoveryError(error));
          if (error instanceof HttpErrorResponse && error.status === 401) {
            this.token = '';
            this.hasToken.set(false);
          }
        },
      });
  }
}

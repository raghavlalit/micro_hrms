import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AuthLayout } from '../../layouts/auth-layout';
interface User {
  kind: 'platform' | 'tenant';
  email: string;
  tenantId?: string;
  permissions: string[];
  mustChangePassword: boolean;
}
@Component({
  imports: [FormsModule, RouterLink, AuthLayout, ...MATERIAL_FORM_IMPORTS],
  selector: 'app-auth-page',
  styleUrl: './auth-page.scss',
  templateUrl: './auth-page.html',
})
export class AuthPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly user = signal<User | null>(null);
  readonly busy = signal(false);
  readonly ready = signal(false);
  readonly message = signal('');
  readonly changingPassword = signal(false);
  kind = 'platform';
  email = '';
  password = '';
  company = '';
  newPassword = '';
  confirmPassword = '';
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  constructor() {
    this.http.get<{ user: User }>('/api/v1/auth/me').subscribe({
      next: (result) => {
        this.user.set(result.user);
        this.ready.set(true);
      },
      error: () => this.ready.set(true),
    });
  }
  login() {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.http
      .post<{ user: User }>(
        '/api/v1/auth/login',
        {
          kind: this.kind,
          email: this.email,
          password: this.password,
          ...(this.kind === 'tenant' ? { company: this.company } : {}),
        },
        this.options,
      )
      .subscribe({
        next: (result) => {
          this.user.set(result.user);
          this.password = '';
          this.busy.set(false);
          if (!result.user.mustChangePassword) {
            void this.router.navigateByUrl(
              result.user.kind === 'platform' ? '/platform/companies' : '/company/overview',
            );
          }
        },
        error: (error) => {
          this.password = '';
          this.failure(error);
        },
      });
  }
  logout(all = false) {
    if (this.busy()) return;
    this.busy.set(true);
    this.http.post(`/api/v1/auth/${all ? 'logout-all' : 'logout'}`, {}, this.options).subscribe({
      next: () => this.signedOut('Signed out.'),
      error: (error) => this.failure(error),
    });
  }
  changePassword() {
    if (this.busy()) return;
    if (this.newPassword !== this.confirmPassword) {
      this.message.set('New passwords do not match.');
      return;
    }
    this.busy.set(true);
    this.message.set('');
    this.http
      .post(
        '/api/v1/auth/password',
        { currentPassword: this.password, newPassword: this.newPassword },
        this.options,
      )
      .subscribe({
        next: () => this.signedOut('Password changed. Sign in with your new password.'),
        error: (error) => this.failure(error),
      });
  }
  private signedOut(message: string) {
    this.user.set(null);
    this.busy.set(false);
    this.changingPassword.set(false);
    this.password = '';
    this.newPassword = '';
    this.confirmPassword = '';
    this.message.set(message);
  }
  private failure(error: HttpErrorResponse) {
    this.busy.set(false);
    if (error.status === 401 && this.user()) {
      this.signedOut('Your session has ended. Please sign in.');
      return;
    }
    const detail = error.error?.message;
    this.message.set(
      typeof detail === 'string'
        ? detail
        : 'Unable to complete the request. Please check your details and try again.',
    );
  }
}

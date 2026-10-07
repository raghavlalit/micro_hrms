import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AuthLayout } from '../../layouts/auth-layout';
import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
@Component({
  imports: [FormsModule, RouterLink, AuthLayout, ...MATERIAL_FORM_IMPORTS],
  styleUrl: './auth-page.scss',
  templateUrl: './activate-page.html',
})
export class ActivatePage {
  private readonly http = inject(HttpClient);
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly message = signal('');
  token = inject(ActivatedRoute).snapshot.fragment ?? '';
  password = '';
  confirmation = '';
  constructor() {
    window.history.replaceState(window.history.state, '', window.location.pathname);
  }
  activate() {
    if (this.busy()) return;
    if (this.password !== this.confirmation) {
      this.message.set('Passwords do not match.');
      return;
    }
    this.busy.set(true);
    this.message.set('');
    this.http
      .post(
        '/api/v1/auth/activate',
        { token: this.token, password: this.password },
        { headers: { 'X-HRMS-Request': '1' } },
      )
      .subscribe({
        next: () => {
          this.done.set(true);
          this.busy.set(false);
          this.token = '';
          this.password = '';
          this.confirmation = '';
        },
        error: (error) => {
          this.busy.set(false);
          const m = error.error?.message;
          this.message.set(
            Array.isArray(m)
              ? m.join('. ')
              : m || 'Activation failed. Ask for a new link if it has expired.',
          );
        },
      });
  }
}

import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
@Injectable({ providedIn: 'root' })
export class PasswordRecoveryApi {
  private readonly http = inject(HttpClient);
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  request(company: string, email: string) {
    return this.http.post<{ message: string }>(
      '/api/v1/auth/forgot-password',
      { company: company.trim().toLowerCase(), email: email.trim().toLowerCase() },
      this.options,
    );
  }
  reset(token: string, password: string) {
    return this.http.post<{ message: string }>(
      '/api/v1/auth/reset-password',
      { token, password },
      this.options,
    );
  }
}
export function recoveryError(error: unknown) {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 429)
      return 'Too many attempts. Please wait 15 minutes before trying again.';
    if (error.status === 401) return 'This reset link is invalid or expired. Request a new link.';
    if (error.status === 400)
      return 'Check the details and try again. Passwords must contain 15–128 characters.';
  }
  return 'Unable to complete the request. Please try again.';
}

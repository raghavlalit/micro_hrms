import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ForgotPasswordPage } from './forgot-password-page';
import { ResetPasswordPage } from './reset-password-page';
import { SessionService } from '../../core/auth/session.service';

describe('Password recovery', () => {
  const token = '11111111-1111-4111-8111-111111111111.r.' + 'a'.repeat(64);
  function setup(fragment = token) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { fragment: new BehaviorSubject(fragment) } },
        { provide: Router, useValue: { navigateByUrl: () => Promise.resolve(true) } },
      ],
    });
    return TestBed.inject(HttpTestingController);
  }
  it('normalizes the company/email, sends CSRF header and shows generic confirmation', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new ForgotPasswordPage());
    page.company = ' ACME ';
    page.email = ' USER@example.test ';
    page.submit();
    page.submit();
    const request = http.expectOne('/api/v1/auth/forgot-password');
    expect(request.request.body).toEqual({ company: 'acme', email: 'user@example.test' });
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush({ message: 'If an active account matches, check your email.' });
    expect(page.done()).toBe(true);
    expect(page.busy()).toBe(false);
    expect(page.message()).toContain('If an active');
    http.verify();
  });
  it('shows rate-limit guidance without claiming an email was sent', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new ForgotPasswordPage());
    page.submit();
    http
      .expectOne('/api/v1/auth/forgot-password')
      .flush({}, { status: 429, statusText: 'Limited' });
    expect(page.done()).toBe(false);
    expect(page.error()).toContain('15 minutes');
    expect(page.busy()).toBe(false);
    http.verify();
  });
  it('removes the token from history and prevents mismatched passwords being submitted', () => {
    const http = setup();
    window.history.replaceState({}, '', '/reset-password#' + token);
    const page = TestBed.runInInjectionContext(() => new ResetPasswordPage());
    expect(window.location.hash).toBe('');
    expect(page.hasToken()).toBe(true);
    page.password = 'Password confirmation mismatch';
    page.confirmation = 'different';
    page.submit();
    expect(page.error()).toContain('do not match');
    http.expectNone('/api/v1/auth/reset-password');
    http.verify();
  });
  it('clears secrets and cached session after a successful reset without auto-login', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new ResetPasswordPage());
    const session = TestBed.inject(SessionService);
    session.user.set({
      id: 'user',
      kind: 'tenant',
      email: 'user@example.test',
      permissions: [],
      mustChangePassword: false,
    });
    page.password = page.confirmation = 'A new recovery password 123!';
    page.submit();
    page.submit();
    const request = http.expectOne('/api/v1/auth/reset-password');
    expect(request.request.body).toEqual({ token, password: 'A new recovery password 123!' });
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush({ message: 'Password reset' });
    expect(page.done()).toBe(true);
    expect(page.password).toBe('');
    expect(page.confirmation).toBe('');
    expect(session.user()).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    http.verify();
  });
  it('disables an expired link and clears password inputs on rejection', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new ResetPasswordPage());
    page.password = page.confirmation = 'A new recovery password 123!';
    page.submit();
    http.expectOne('/api/v1/auth/reset-password').flush({}, { status: 401, statusText: 'Expired' });
    expect(page.hasToken()).toBe(false);
    expect(page.password).toBe('');
    expect(page.error()).toContain('expired');
    page.submit();
    http.expectNone('/api/v1/auth/reset-password');
    http.verify();
  });
  it('does not send a request when the reset link is missing', () => {
    const http = setup(''),
      page = TestBed.runInInjectionContext(() => new ResetPasswordPage());
    expect(page.hasToken()).toBe(false);
    page.submit();
    http.expectNone('/api/v1/auth/reset-password');
    http.verify();
  });
  it('opens a fresh form when another email link arrives in the same tab', () => {
    const http = setup(),
      page = TestBed.runInInjectionContext(() => new ResetPasswordPage());
    page.password = page.confirmation = 'A new recovery password 123!';
    page.submit();
    http.expectOne('/api/v1/auth/reset-password').flush({ message: 'Password reset' });
    expect(page.done()).toBe(true);
    const fragment = TestBed.inject(ActivatedRoute).fragment as BehaviorSubject<string>;
    fragment.next(token.replace(/a/g, 'b'));
    expect(page.done()).toBe(false);
    expect(page.hasToken()).toBe(true);
    expect(page.password).toBe('');
    http.verify();
  });
});

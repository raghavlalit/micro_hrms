import { TestBed } from '@angular/core/testing';
import { AuthPage } from './auth-page';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

describe('AuthPage', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AuthPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AuthPage);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('shows login after an unauthenticated session check', async () => {
    const fixture = TestBed.createComponent(AuthPage);
    TestBed.inject(HttpTestingController)
      .expectOne('/api/v1/auth/me')
      .flush({}, { status: 401, statusText: 'Unauthorized' });
    await fixture.whenStable();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Sign in to your workspace');
  });

  it('requires temporary-password change and keeps the session out of browser storage', async () => {
    const fixture = TestBed.createComponent(AuthPage);
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/auth/me').flush({}, { status: 401, statusText: 'Unauthorized' });
    fixture.componentInstance.email = 'admin@example.test';
    fixture.componentInstance.password = 'temporary password';
    fixture.componentInstance.login();
    const login = http.expectOne('/api/v1/auth/login');
    expect(login.request.headers.get('X-HRMS-Request')).toBe('1');
    login.flush({
      user: {
        kind: 'platform',
        email: 'admin@example.test',
        permissions: ['platform.access'],
        mustChangePassword: true,
      },
    });
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('h1').textContent).toContain(
      'Set your own password',
    );
    expect(fixture.componentInstance.password).toBe('');
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    http.verify();
  });
});

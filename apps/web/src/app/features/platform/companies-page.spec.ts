import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CompaniesPage } from './companies-page';

describe('Company onboarding screen', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [CompaniesPage],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }),
  );
  it('renders profile fields and creates only one request while a submission is pending', async () => {
    const fixture = TestBed.createComponent(CompaniesPage),
      http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/platform/companies?page=1&limit=20&search=')
      .flush({ items: [], total: 0 });
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#company-name')).toBeNull();
    fixture.componentInstance.startCreate();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('#company-name')).toBeTruthy();
    const page = fixture.componentInstance;
    page.profile.name = 'Test Company';
    page.profile.contact_email = 'contact@example.test';
    page.slug = 'test-company';
    page.admin_name = 'Test Admin';
    page.admin_email = 'admin@example.test';
    page.create();
    page.create();
    const request = http.expectOne('/api/v1/platform/companies');
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    expect(request.request.body.slug).toBe('test-company');
    expect(request.request.body.status).toBeUndefined();
    request.flush({
      invitation: { token: 'test-activation-token', expires_at: '2026-10-07T12:00:00Z' },
    });
    http
      .expectOne('/api/v1/platform/companies?page=1&limit=20&search=')
      .flush({ items: [], total: 1 });
    expect(page.invitationLink()).toContain('/activate#test-activation-token');
    expect(page.invitationLink()).not.toContain('?');
    expect(page.profile.name).toBe('');
    expect(page.busy()).toBe(false);
    http.verify();
  });
  it('does not submit when required fields in the shared profile form are missing', async () => {
    const fixture = TestBed.createComponent(CompaniesPage);
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/platform/companies?page=1&limit=20&search=')
      .flush({ items: [], total: 0 });
    const page = fixture.componentInstance;
    page.startCreate();
    page.slug = 'valid-company';
    page.admin_name = 'Valid Admin';
    page.admin_email = 'admin@example.test';
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.nativeElement
      .querySelector('form')
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await fixture.whenStable();
    http.expectNone((request) => request.method === 'POST');
    expect(fixture.nativeElement.textContent).toContain('Enter a valid company name.');
    http.verify();
  });
  it('preserves entered company data when the server rejects a duplicate code', () => {
    const fixture = TestBed.createComponent(CompaniesPage),
      http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/platform/companies?page=1&limit=20&search=')
      .flush({ items: [], total: 0 });
    fixture.componentInstance.slug = 'duplicate';
    fixture.componentInstance.profile.name = 'Keep this name';
    fixture.componentInstance.create();
    http
      .expectOne('/api/v1/platform/companies')
      .flush({ message: 'Company code already exists' }, { status: 409, statusText: 'Conflict' });
    expect(fixture.componentInstance.profile.name).toBe('Keep this name');
    expect(fixture.componentInstance.message()).toContain('already exists');
    http.verify();
  });
});

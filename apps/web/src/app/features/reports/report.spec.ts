import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SessionService } from '../../core/auth/session.service';
import { ReportPage } from './report-page';
import { reportError } from './report-api.service';
import { HttpErrorResponse } from '@angular/common/http';
describe('Reporting workflow', () => {
  function setup(permissions = ['reports.read.company', 'employees.manage', 'attendance.manage']) {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    TestBed.inject(SessionService).user.set({
      id: 'user',
      kind: 'tenant',
      email: 'hr@example.test',
      permissions,
      mustChangePassword: false,
    });
    return {
      page: TestBed.runInInjectionContext(() => new ReportPage()),
      http: TestBed.inject(HttpTestingController),
    };
  }
  it('requires matching domain access and does not offer payroll just for report access', () => {
    const { page, http } = setup(['reports.read.company']);
    expect(page.kinds).toEqual([]);
    http.expectNone((request) => request.url.startsWith('/api/v1/reports'));
    http.verify();
  });
  it('paginates applied filters and clears old results when the report changes', () => {
    const { page, http } = setup();
    http.expectOne('/api/v1/reports/options?kind=employees').flush({
      kind: 'employees',
      scope: 'company',
      available: ['employees', 'attendance'],
      today: '2026-10-08',
      departments: [],
      locations: [],
      runs: [],
    });
    http.expectOne('/api/v1/reports/employees?page=1&limit=20').flush({
      kind: 'employees',
      scope: 'company',
      rows: [{ employee_code: 'EMP1' }],
      columns: [],
      total: 60,
    });
    page.search = 'Unapplied search';
    page.paginate({ pageIndex: 1, pageSize: 20, length: 60 });
    http
      .expectOne('/api/v1/reports/employees?page=2&limit=20')
      .flush({ kind: 'employees', rows: [], total: 60 });
    page.kind = 'attendance';
    page.changeKind();
    expect(page.result()).toBeNull();
    expect(page.search).toBe('');
    http.expectOne('/api/v1/reports/options?kind=attendance').flush({
      kind: 'attendance',
      scope: 'company',
      today: '2026-10-08',
      departments: [],
      locations: [],
      runs: [],
    });
    const request = http.expectOne(
      '/api/v1/reports/attendance?from=2026-10-01&to=2026-10-08&page=1&limit=20',
    );
    expect(request.request.params.has('status')).toBe(false);
    request.flush({ kind: 'attendance', rows: [], total: 0 });
    http.verify();
  });
  it('clears stale rows on a failed reload and permits retry', async () => {
    const { page, http } = setup();
    http
      .expectOne('/api/v1/reports/options?kind=employees')
      .flush({ today: '2026-10-08', runs: [] });
    http
      .expectOne((request) => request.url === '/api/v1/reports/employees')
      .flush({ rows: [{ employee_code: 'EMP1' }], total: 1 });
    page.search = 'Broad filter';
    page.load(true);
    http
      .expectOne((request) => request.url === '/api/v1/reports/employees')
      .flush(
        { message: 'Report exceeds 5000 rows. Narrow the filters.' },
        { status: 413, statusText: 'Too large' },
      );
    await Promise.resolve();
    expect(page.result()).toBeNull();
    expect(page.busy()).toBe(false);
    expect(page.error()).toContain('5000');
    page.search = 'Narrow';
    page.load(true);
    http
      .expectOne((request) => request.params.get('search') === 'Narrow')
      .flush({ rows: [], total: 0 });
    http.verify();
  });
  it('reads JSON errors returned by CSV downloads', async () => {
    const error = new HttpErrorResponse({
      error: new Blob([JSON.stringify({ message: 'Permission denied' })], {
        type: 'application/json',
      }),
      status: 403,
    });
    expect(await reportError(error)).toBe('Permission denied');
  });
  it('queues oversized reports with applied filters and safely repeats an uncertain request', async () => {
    const { page, http } = setup();
    http
      .expectOne('/api/v1/reports/options?kind=employees')
      .flush({ today: '2026-10-09', runs: [] });
    http
      .expectOne('/api/v1/reports/employees?page=1&limit=20')
      .flush({ message: 'Use background export' }, { status: 413, statusText: 'Too large' });
    await Promise.resolve();
    page.search = 'Not applied';
    page.queue();
    const first = http.expectOne('/api/v1/reports/employees/export-jobs');
    expect(first.request.body.search).toBeUndefined();
    const operation = first.request.body.operation_id;
    expect(operation).toMatch(/^[a-f0-9-]{36}$/);
    first.flush({ message: 'Connection interrupted' }, { status: 503, statusText: 'Unavailable' });
    await Promise.resolve();
    page.queue();
    const retry = http.expectOne('/api/v1/reports/employees/export-jobs');
    expect(retry.request.body.operation_id).toBe(operation);
    retry.flush({ id: 'job', status: 'pending' });
    expect(page.notice()).toContain('My exports');
    expect(page.busy()).toBe(false);
    page.queue();
    const fresh = http.expectOne('/api/v1/reports/employees/export-jobs');
    expect(fresh.request.body.operation_id).not.toBe(operation);
    fresh.flush({ id: 'new-job', status: 'pending' });
    http.verify();
  });
});

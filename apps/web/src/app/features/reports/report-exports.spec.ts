import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportExportsPage } from './report-exports-page';
import { BackgroundJobView } from '../../shared/background-job';

describe('Background export screen', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const page = TestBed.runInInjectionContext(() => new ReportExportsPage());
    return { page, http: TestBed.inject(HttpTestingController) };
  }
  const failed = {
    id: 'job',
    kind: 'report_export',
    status: 'failed',
    report_type: 'employees',
    error_code: 'GENERATION_FAILED',
  } as BackgroundJobView;
  it('retries failed exports and reloads their current status', () => {
    const { page, http } = setup();
    http.expectOne('/api/v1/report-exports?page=1&limit=20').flush({ items: [failed], total: 1 });
    page.retry(failed);
    http.expectOne('/api/v1/report-exports/job/retry').flush({ ...failed, status: 'pending' });
    http
      .expectOne('/api/v1/report-exports?page=1&limit=20')
      .flush({ items: [{ ...failed, status: 'pending' }], total: 1 });
    expect(page.rows()[0].status).toBe('pending');
    expect(page.notice()).toContain('queued');
    http.verify();
  });
  it('clears stale rows on refresh failure and displays expired-download errors', async () => {
    const { page, http } = setup();
    http.expectOne('/api/v1/report-exports?page=1&limit=20').flush({ items: [failed], total: 1 });
    page.load();
    http
      .expectOne('/api/v1/report-exports?page=1&limit=20')
      .flush({ message: 'Unavailable' }, { status: 503, statusText: 'Unavailable' });
    await Promise.resolve();
    expect(page.rows()).toEqual([]);
    expect(page.busy()).toBe(false);
    page.download({ ...failed, status: 'completed' });
    http
      .expectOne('/api/v1/report-exports/job/download')
      .flush(
        new Blob([JSON.stringify({ message: 'Export expired; request a new one' })], {
          type: 'application/json',
        }),
        { status: 410, statusText: 'Gone' },
      );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(page.error()).toContain('expired');
    expect(page.busy()).toBe(false);
    http.verify();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardPage } from './dashboard-page';
import { DatePipe } from '@angular/common';
describe('Dashboard refresh', () => {
  it('keeps calendar dates and payroll months unchanged across browser timezones', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const page = TestBed.runInInjectionContext(() => new DashboardPage());
    TestBed.inject(HttpTestingController).expectOne('/api/v1/dashboard').flush({});
    const pipe = new DatePipe('en-US');
    expect(pipe.transform(page.calendarDate('2026-10-08'), 'yyyy-MM-dd', 'UTC')).toBe('2026-10-08');
    expect(pipe.transform(page.calendarDate('2026-09-01'), 'MMMM yyyy', 'UTC')).toBe(
      'September 2026',
    );
    TestBed.inject(HttpTestingController).verify();
  });
  it('clears stale counts on failure and lets the user retry', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const page = TestBed.runInInjectionContext(() => new DashboardPage()),
      http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/dashboard').flush({ today: '2026-10-08', workforce: { total: 7 } });
    expect(page.data()?.workforce?.total).toBe(7);
    page.load();
    page.load();
    http.expectOne('/api/v1/dashboard').flush({}, { status: 503, statusText: 'Unavailable' });
    expect(page.data()).toBeNull();
    expect(page.error()).toContain('try again');
    expect(page.loading()).toBe(false);
    page.load();
    http.expectOne('/api/v1/dashboard').flush({ today: '2026-10-08', workforce: { total: 8 } });
    expect(page.data()?.workforce?.total).toBe(8);
    http.verify();
  });
});

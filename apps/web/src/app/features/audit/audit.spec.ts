import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialog } from '@angular/material/dialog';
import { AuditPage } from './audit-page';
import { AuditDetailDialog } from './audit-detail-dialog';

describe('Audit history', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialog, useValue: { open: () => {} } },
        { provide: MAT_DIALOG_DATA, useValue: 'event-id' },
      ],
    });
    return TestBed.inject(HttpTestingController);
  }
  function page(http: HttpTestingController) {
    const page = TestBed.runInInjectionContext(() => new AuditPage());
    http
      .expectOne('/api/v1/audit-logs/options')
      .flush({ modules: ['leave'], actions: ['leave.approved'] });
    http.expectOne('/api/v1/audit-logs?page=1&limit=20').flush({ items: [], total: 0 });
    return page;
  }
  it('applies filters explicitly and preserves them while paging', () => {
    const http = setup(),
      view = page(http);
    view.page = 3;
    view.filters.actor = '  Ada  ';
    view.filters.module = 'leave';
    view.apply();
    const request = http.expectOne('/api/v1/audit-logs?page=1&limit=20&actor=Ada&module=leave');
    request.flush({ items: [], total: 21 });
    view.filters.actor = 'Unsaved edit';
    view.page = 2;
    view.load();
    http
      .expectOne('/api/v1/audit-logs?page=2&limit=20&actor=Ada&module=leave')
      .flush({ items: [], total: 21 });
    http.verify();
  });
  it('rejects reversed dates and resets the filters and pagination', () => {
    const http = setup(),
      view = page(http);
    view.filters.from = '2026-10-08';
    view.filters.to = '2026-10-01';
    view.apply();
    expect(view.error()).toContain('must not be after');
    http.expectNone((request) => request.url === '/api/v1/audit-logs');
    view.page = 2;
    view.reset();
    http.expectOne('/api/v1/audit-logs?page=1&limit=20').flush({ items: [], total: 0 });
    expect(view.filters.from).toBe('');
    http.verify();
  });
  it('clears stale data on permission failure and permits a retry', () => {
    const http = setup(),
      view = page(http);
    view.rows.set([{ id: 'old' } as never]);
    view.total = 20;
    view.load();
    http
      .expectOne('/api/v1/audit-logs?page=1&limit=20')
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(view.rows()).toEqual([]);
    expect(view.total).toBe(0);
    expect(view.error()).toContain('permission');
    expect(view.loading()).toBe(false);
    view.load();
    http.expectOne('/api/v1/audit-logs?page=1&limit=20').flush({ items: [], total: 0 });
    expect(view.error()).toBe('');
    http.verify();
  });
  it('handles unavailable event details without retaining a previous event', () => {
    const http = setup(),
      dialog = TestBed.runInInjectionContext(() => new AuditDetailDialog());
    http
      .expectOne('/api/v1/audit-logs/event-id')
      .flush({}, { status: 404, statusText: 'Not found' });
    expect(dialog.event()).toBeNull();
    expect(dialog.error()).toContain('not available');
    dialog.load();
    http.expectOne('/api/v1/audit-logs/event-id').flush({ id: 'event-id', details: {} });
    expect(dialog.event()?.id).toBe('event-id');
    expect(dialog.error()).toBe('');
    http.verify();
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialog, MatDialogRef } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { NgForm } from '@angular/forms';
import { of } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { LeaveAssignmentPage } from './leave-assignment-page';
import { BulkAssignmentData, LeaveBulkDialog } from './leave-bulk-dialog';

describe('Employee leave assignments', () => {
  it('keeps selection tied to loaded filters, preserves page selection and clears it when filters are applied', () => {
    const open = vi.fn((_component: unknown, _config: { data: BulkAssignmentData }) => ({
      afterClosed: () => of(undefined),
    }));
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl: vi.fn() } },
        { provide: SessionService, useValue: { user: signal({ permissions: ['leave.manage'] }) } },
        { provide: MatDialog, useValue: { open } },
      ],
    });
    const page = TestBed.runInInjectionContext(() => new LeaveAssignmentPage());
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/leave/policies').flush([]);
    http.expectOne('/api/v1/leave/assignments/departments').flush([]);
    http.expectOne('/api/v1/leave/assignments/locations').flush([]);
    http.expectOne('/api/v1/leave/assignments/jobs').flush([]);
    http
      .expectOne((r) => r.url === '/api/v1/leave/assignments')
      .flush({ items: [{ id: 'a', name: 'A' }], total: 1000, summary: { total: 1000 } });
    page.selectPage(true);
    expect(page.count()).toBe(1);
    page.page(1);
    const second = http.expectOne((r) => r.url === '/api/v1/leave/assignments');
    expect(second.request.params.get('page')).toBe('2');
    second.flush({ items: [{ id: 'b', name: 'B' }], total: 1000, summary: { total: 1000 } });
    page.selectPage(true);
    expect(page.count()).toBe(2);
    page.allMatching.set(true);
    page.filters.search = 'Unsubmitted text';
    page.bulk();
    expect(open.mock.calls[0][1].data.filters.search).toBeUndefined();
    expect(open.mock.calls[0][1].data.count).toBe(1000);
    page.apply();
    expect(page.count()).toBe(0);
    expect(page.allMatching()).toBe(false);
    const filtered = http.expectOne((r) => r.url === '/api/v1/leave/assignments');
    expect(filtered.request.params.get('search')).toBe('Unsubmitted text');
    expect(filtered.request.params.get('page')).toBe('1');
    filtered.flush({ items: [], total: 0, summary: { total: 0 } });
    http.verify();
  });
  it('only queues a reviewed preview, sends numeric credit, and shows confirmation conflicts without closing', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close, disableClose: false } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            filters: { year: 2028, page: 1, limit: 20, search: '' },
            allMatching: true,
            ids: [],
            count: 1000,
          },
        },
      ],
    });
    const dialog = TestBed.runInInjectionContext(() => new LeaveBulkDialog());
    const http = TestBed.inject(HttpTestingController);
    http
      .expectOne('/api/v1/leave/policies')
      .flush([
        { id: 'policy', name: 'Annual', annual_entitlement: '18.00', balance_controlled: true },
      ]);
    dialog.confirm();
    http.expectNone((r) => r.method === 'POST');
    dialog.policyId = 'policy';
    dialog.choosePolicy();
    dialog.reason = 'Reviewed annual entitlement';
    dialog.prepare({ invalid: false } as NgForm);
    const preview = http.expectOne('/api/v1/leave/assignments/preview');
    expect(preview.request.body.credited).toBe(18);
    expect(preview.request.body.employee_ids).toBeUndefined();
    expect(preview.request.body.filters.search).toBeUndefined();
    expect(preview.request.headers.get('X-HRMS-Request')).toBe('1');
    preview.flush({
      id: 'job',
      status: 'draft',
      counts: { assignable: 999, skipped: 1, rejected: 0 },
      items: [],
      total: 1000,
    });
    expect(close).not.toHaveBeenCalled();
    dialog.confirm();
    http
      .expectOne('/api/v1/leave/assignments/jobs/job/confirm')
      .flush(
        { message: 'Policy changed; create a fresh preview' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(dialog.error()).toContain('Policy changed');
    expect(close).not.toHaveBeenCalled();
    expect(dialog.busy()).toBe(false);
    http.verify();
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { LeaveApplyDialog } from './leave-apply-dialog';

describe('Leave application', () => {
  it('requires a calculation, invalidates stale previews and preserves conflicts without closing', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            employee: { name: 'Employee' },
            year: 2026,
            timezone: 'Asia/Kolkata',
            assignments: [],
          },
        },
      ],
    });
    const dialog = TestBed.runInInjectionContext(() => new LeaveApplyDialog());
    const http = TestBed.inject(HttpTestingController);
    dialog.submit();
    http.expectNone('/api/v1/leave/requests');
    dialog.form.patchValue({
      policy_id: 'policy',
      start_date: '2026-10-08',
      end_date: '2026-10-08',
      reason: 'Personal leave',
    });
    dialog.calculate();
    const preview = http.expectOne('/api/v1/leave/preview');
    expect(preview.request.headers.get('X-HRMS-Request')).toBe('1');
    preview.flush({
      days: [{ date: '2026-10-08', half: 'full', units: 1 }],
      units: 1,
      available: 12,
      is_paid: true,
      timezone: 'Asia/Kolkata',
    });
    expect(dialog.preview()?.units).toBe(1);
    dialog.form.controls.end_date.setValue('2026-10-09');
    expect(dialog.preview()).toBeNull();
    dialog.submit();
    http.expectNone('/api/v1/leave/requests');
    dialog.calculate();
    http
      .expectOne('/api/v1/leave/preview')
      .flush({ days: [], units: 2, available: 12, is_paid: true, timezone: 'Asia/Kolkata' });
    dialog.submit();
    const submit = http.expectOne('/api/v1/leave/requests');
    expect(submit.request.body.end_date).toBe('2026-10-09');
    submit.flush(
      { message: 'Insufficient available leave balance' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(dialog.error()).toContain('Insufficient');
    expect(dialog.preview()).toBeNull();
    expect(close).not.toHaveBeenCalled();
    http.verify();
  });
});

import { companyTimeToIso, displayTime } from './attendance.models';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { AttendanceEditDialog } from './attendance-edit-dialog';
describe('Attendance time handling', () => {
  it('converts company times independently of browser timezone and preserves half-hour offsets', () => {
    expect(companyTimeToIso('2026-10-06', '09:00', 'Asia/Kolkata')).toBe(
      '2026-10-06T03:30:00.000Z',
    );
    expect(companyTimeToIso('2026-10-06', '00:15', 'Asia/Kolkata')).toBe(
      '2026-10-05T18:45:00.000Z',
    );
    expect(displayTime('2026-10-06T03:30:00Z', 'Asia/Kolkata')).toBe('09:00');
  });
  it('rejects nonexistent and ambiguous daylight-saving local times', () => {
    expect(() => companyTimeToIso('2026-03-08', '02:30', 'America/New_York')).toThrow(
      'does not exist',
    );
    expect(() => companyTimeToIso('2026-11-01', '01:30', 'America/New_York')).toThrow(
      'occurs twice',
    );
    expect(companyTimeToIso('2026-03-08', '03:30', 'America/New_York')).toBe(
      '2026-03-08T07:30:00.000Z',
    );
  });
  it('validates times before sending and keeps API conflict feedback visible', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            day: {
              work_date: '2026-10-06',
              timezone: 'Asia/Kolkata',
              check_in: null,
              check_out: null,
            },
            employeeId: 'e1',
            manual: false,
            name: 'Employee',
          },
        },
      ],
    });
    const dialog = TestBed.runInInjectionContext(() => new AttendanceEditDialog()),
      http = TestBed.inject(HttpTestingController);
    dialog.form.patchValue({ start: '18:00', end: '09:00', reason: 'Missed checkout' });
    dialog.save();
    http.expectNone('/api/v1/attendance/regularizations');
    expect(dialog.error()).toContain('after');
    dialog.form.patchValue({ start: '09:00', end: '18:00' });
    dialog.save();
    const request = http.expectOne('/api/v1/attendance/regularizations');
    expect(request.request.body).toEqual({
      work_date: '2026-10-06',
      check_in: '2026-10-06T03:30:00.000Z',
      check_out: '2026-10-06T12:30:00.000Z',
      reason: 'Missed checkout',
    });
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush(
      { message: 'A pending correction already exists' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(dialog.error()).toContain('pending correction');
    expect(close).not.toHaveBeenCalled();
    http.verify();
  });
});

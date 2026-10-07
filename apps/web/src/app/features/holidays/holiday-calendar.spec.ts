import { calendarCells } from './holiday.models';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { HolidayEditorDialog } from './holiday-editor-dialog';

describe('Holiday calendar dates', () => {
  it('keeps leap day and month boundaries aligned to a Monday-first week', () => {
    const cells = calendarCells(2028, 1, []);
    expect(cells.filter((cell) => cell.date).length).toBe(29);
    expect(cells[1].date).toBe('2028-02-01');
    expect(cells.find((cell) => cell.day === 29)?.date).toBe('2028-02-29');
    expect(calendarCells(2026, 1, []).filter((cell) => cell.date).length).toBe(28);
    expect(calendarCells(2026, 10, [])[6].date).toBe('2026-11-01');
  });
  it('keeps a company-wide holiday company-wide when editing from a location filter', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MatDialogRef, useValue: { close } },
        {
          provide: MAT_DIALOG_DATA,
          useValue: {
            holiday: {
              id: 'h1',
              name: 'Company Day',
              holiday_date: '2026-12-25',
              location_id: null,
              description: '',
            },
            date: '2026-12-01',
            locationId: 'local-id',
            locations: [],
          },
        },
      ],
    });
    const dialog = TestBed.runInInjectionContext(() => new HolidayEditorDialog());
    expect(dialog.form.controls.location_id.value).toBe('');
    dialog.save();
    const http = TestBed.inject(HttpTestingController),
      request = http.expectOne('/api/v1/holidays/h1');
    expect(request.request.body.location_id).toBeNull();
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush(
      { message: 'A holiday already covers this date' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(close).not.toHaveBeenCalled();
    expect(dialog.error()).toContain('already covers');
    expect(dialog.busy()).toBe(false);
    http.verify();
  });
});

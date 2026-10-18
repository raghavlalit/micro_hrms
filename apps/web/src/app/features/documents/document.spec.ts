import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgForm } from '@angular/forms';
import { DocumentDialog } from './document-dialog';
describe('Document uploads', () => {
  const form = { invalid: false } as NgForm;
  it('preserves the selected file and operation ID on retry without setting a multipart boundary', () => {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: MAT_DIALOG_DATA,
          useValue: { action: 'version', document: { id: 'doc', revision: 'current' } },
        },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    const dialog = TestBed.runInInjectionContext(() => new DocumentDialog()),
      http = TestBed.inject(HttpTestingController);
    dialog.reason = 'Reviewed replacement';
    dialog.save(form);
    expect(dialog.error()).toContain('Choose a file');
    http.expectNone('/api/v1/documents/doc/versions');
    dialog.selectFile({
      target: { files: [new File(['content'], 'contract.pdf', { type: 'application/pdf' })] },
    } as unknown as Event);
    dialog.save(form);
    const first = http.expectOne('/api/v1/documents/doc/versions');
    const body = first.request.body as FormData;
    expect(body.get('revision')).toBe('current');
    expect(body.get('file')).toBeInstanceOf(File);
    expect(first.request.headers.has('Content-Type')).toBe(false);
    expect(first.request.headers.get('X-HRMS-Request')).toBe('1');
    first.flush({ message: 'Storage unavailable' }, { status: 503, statusText: 'Unavailable' });
    expect(dialog.error()).toContain('Storage');
    expect(close).not.toHaveBeenCalled();
    expect(dialog.busy()).toBe(false);
    dialog.save(form);
    const retry = http.expectOne('/api/v1/documents/doc/versions');
    expect(retry.request.body.get('operation_id')).toBe(body.get('operation_id'));
    retry.flush({ id: 'version' });
    expect(close).toHaveBeenCalledWith({ id: 'version' });
    http.verify();
  });
  it('rejects unsupported files and clears employees no longer in search results', () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: { action: 'create' } },
        { provide: MatDialogRef, useValue: { close: vi.fn() } },
      ],
    });
    const dialog = TestBed.runInInjectionContext(() => new DocumentDialog()),
      http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/documents/categories').flush([]);
    http
      .expectOne((request) => request.url === '/api/v1/documents/people')
      .flush({ items: [{ id: 'one', name: 'Employee One' }], total: 1 });
    dialog.employeeId = 'one';
    dialog.search = 'Employee Two';
    dialog.find(true);
    http
      .expectOne((request) => request.url === '/api/v1/documents/people')
      .flush({ items: [{ id: 'two', name: 'Employee Two' }], total: 1 });
    expect(dialog.employeeId).toBe('');
    dialog.selectFile({
      target: { files: [new File(['script'], 'file.html', { type: 'text/html' })] },
    } as unknown as Event);
    expect(dialog.file).toBeNull();
    expect(dialog.error()).toContain('PDF');
    http.verify();
  });
});

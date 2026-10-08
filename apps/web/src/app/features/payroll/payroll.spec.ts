import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { NgForm } from '@angular/forms';
import { SalaryDialog } from './salary-dialog';
import { PayrollActionDialog } from './payroll-action-dialog';

describe('Payroll forms', () => {
  const form = { invalid: false } as NgForm;
  function setup(data: unknown) {
    const close = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: { close } },
      ],
    });
    return { close, http: TestBed.inject(HttpTestingController) };
  }

  it('sends salary amounts as exact strings and preserves rejected input', () => {
    const { close, http } = setup({ employeeId: 'employee', name: 'Test Employee' });
    const dialog = TestBed.runInInjectionContext(() => new SalaryDialog());
    http.expectOne('/api/v1/payroll/components').flush([]);
    dialog.effectiveFrom = '2026-09-01';
    dialog.reason = 'Salary approval';
    dialog.lines = [{ component_id: 'basic', amount: '999999999999.99' }];
    dialog.save(form);
    const request = http.expectOne('/api/v1/payroll/employees/employee/salaries');
    expect(request.request.body.lines[0].amount).toBe('999999999999.99');
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush(
      { message: 'Salary overlaps locked payroll' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(dialog.error()).toContain('locked payroll');
    expect(dialog.lines[0].amount).toBe('999999999999.99');
    expect(dialog.busy()).toBe(false);
    expect(close).not.toHaveBeenCalled();
    http.verify();
  });

  it('binds adjustments to the reviewed revision and reuses the retry operation ID', () => {
    const { close, http } = setup({
      action: 'adjust',
      run: { id: 'run', calculation_version: 2, calculation_config: { revision: 'revision-2' } },
      item: { id: 'payroll-item' },
    });
    const dialog = TestBed.runInInjectionContext(() => new PayrollActionDialog());
    dialog.reason = 'Approved bonus';
    dialog.name = 'Bonus';
    dialog.amount = '100.01';
    dialog.save(form);
    const first = http.expectOne('/api/v1/payroll/employees/payroll-item/adjustments');
    const body = first.request.body;
    expect(body).toMatchObject({
      calculation_version: 2,
      revision: 'revision-2',
      amount: '100.01',
    });
    expect(body.operation_id).toMatch(/^[a-f0-9-]{36}$/);
    first.flush(
      { message: 'Payroll changed. Reload and review the current amounts.' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(dialog.error()).toContain('Reload');
    expect(close).not.toHaveBeenCalled();
    dialog.save(form);
    const retry = http.expectOne('/api/v1/payroll/employees/payroll-item/adjustments');
    expect(retry.request.body.operation_id).toBe(body.operation_id);
    retry.flush({ id: body.operation_id });
    expect(close).toHaveBeenCalledWith(true);
    http.verify();
  });
});

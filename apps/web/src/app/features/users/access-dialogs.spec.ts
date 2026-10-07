import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { UserActionDialog } from './user-action-dialog';
import { RoleEditorDialog } from './role-editor-dialog';

describe('Access management forms', () => {
  const dialog = { close: vi.fn(), disableClose: false };
  beforeEach(() => {
    dialog.close.mockReset();
    dialog.disableClose = false;
  });
  function setup(data: object) {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: MAT_DIALOG_DATA, useValue: data },
        { provide: MatDialogRef, useValue: dialog },
      ],
    });
  }
  it('requires valid identity, roles and audit reason before issuing an invitation', () => {
    setup({ action: 'invite', roles: [] });
    const form = TestBed.runInInjectionContext(() => new UserActionDialog());
    const http = TestBed.inject(HttpTestingController);
    form.save();
    http.expectNone('/api/v1/users');
    form.form.setValue({
      display_name: '  Sam Lee  ',
      email: 'SAM@example.test',
      role_ids: ['role-id'],
      reason: 'Approved access',
    });
    form.save();
    const request = http.expectOne('/api/v1/users');
    expect(request.request.body).toEqual({
      display_name: 'Sam Lee',
      email: 'sam@example.test',
      role_ids: ['role-id'],
      reason: 'Approved access',
    });
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush({ id: 'new-user', invitation: { token: 'test', expires_at: '2030-01-01' } });
    expect(dialog.close).toHaveBeenCalledOnce();
    http.verify();
  });
  it('keeps rejected access changes open with the server explanation', () => {
    setup({ action: 'status', roles: [], user: { id: 'admin', status: 'active', roles: [] } });
    const form = TestBed.runInInjectionContext(() => new UserActionDialog());
    form.form.controls.reason.setValue('Access review');
    form.save();
    const http = TestBed.inject(HttpTestingController),
      request = http.expectOne('/api/v1/users/admin/status');
    request.flush(
      { message: 'Keep at least one active Company Admin.' },
      { status: 409, statusText: 'Conflict' },
    );
    expect(form.error()).toContain('Keep at least one');
    expect(form.busy()).toBe(false);
    expect(dialog.close).not.toHaveBeenCalled();
    expect(dialog.disableClose).toBe(false);
    http.verify();
  });
  it('requires permissions and omits the immutable role code from updates', () => {
    setup({
      role: {
        id: 'role',
        code: 'custom_role',
        name: 'Custom',
        permission_codes: [],
        user_count: 1,
      },
      permissions: [],
    });
    const form = TestBed.runInInjectionContext(() => new RoleEditorDialog());
    const http = TestBed.inject(HttpTestingController);
    form.form.controls.reason.setValue('Scope narrowed');
    form.save();
    http.expectNone('/api/v1/roles/role');
    form.toggle('employees.read.self', true);
    form.save();
    const request = http.expectOne('/api/v1/roles/role');
    expect(request.request.body.code).toBeUndefined();
    expect(request.request.body.permission_codes).toEqual(['employees.read.self']);
    request.flush({ id: 'role' });
    expect(dialog.close).toHaveBeenCalledWith(true);
    http.verify();
  });
});

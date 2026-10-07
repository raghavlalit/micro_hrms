import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { EmployeeApi } from './employee-api.service';
import { Employee, editableProfile } from './employee.models';

describe('Employee API payloads', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );
  it('keeps system fields out of profile updates and clears optional dates and email safely', () => {
    const employee = {
      id: 'id',
      tenant_id: 'tenant',
      user_id: 'user',
      status: 'active',
      employee_code: 'E001',
      first_name: 'Alex',
      last_name: 'Lee',
      joining_date: '2026-01-01',
      employment_type: 'Full-time',
      email: '',
      date_of_birth: '',
      probation_ends_on: '',
      department_name: 'Engineering',
      address: { city: 'Pune' },
    } as unknown as Employee;
    TestBed.inject(EmployeeApi).save(editableProfile(employee), employee.id).subscribe();
    const http = TestBed.inject(HttpTestingController),
      request = http.expectOne('/api/v1/employees/id');
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    expect(request.request.body.status).toBeUndefined();
    expect(request.request.body.tenant_id).toBeUndefined();
    expect(request.request.body.user_id).toBeUndefined();
    expect(request.request.body.department_name).toBeUndefined();
    expect(request.request.body.email).toBeNull();
    expect(request.request.body.date_of_birth).toBeNull();
    expect(request.request.body.probation_ends_on).toBeNull();
    expect(request.request.body.address.city).toBe('Pune');
    request.flush({});
    http.verify();
  });
  it('sends private values only to the explicit protected endpoint', () => {
    const values = {
      bank_details: [{ label: 'Account', value: 'test-value' }],
      statutory_identifiers: [],
    };
    TestBed.inject(EmployeeApi).savePrivate('employee-id', values).subscribe();
    const http = TestBed.inject(HttpTestingController),
      request = http.expectOne('/api/v1/employees/employee-id/private');
    expect(request.request.body).toEqual(values);
    expect(request.request.headers.get('X-HRMS-Request')).toBe('1');
    request.flush({ saved: true });
    http.verify();
  });
});

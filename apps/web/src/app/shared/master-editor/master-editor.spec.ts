import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { MasterEditor } from './master-editor';
import { MasterConfig, nameAndCode } from './master-config';
const master: MasterConfig = {
  title: 'Departments',
  endpoint: 'organization/departments',
  description: 'Test',
  fields: nameAndCode,
  defaults: { name: '', code: '' },
};
describe('Master-data editor', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      imports: [MasterEditor],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { data: { master } } } },
      ],
    }),
  );
  it('sends only editable fields and never resubmits tenant identifiers or timestamps', () => {
    const fixture = TestBed.createComponent(MasterEditor),
      http = TestBed.inject(HttpTestingController),
      page = fixture.componentInstance;
    http.expectOne('/api/v1/organization/departments').flush([]);
    page.edit({
      id: 'record-id',
      tenant_id: 'private-tenant',
      created_at: 'old',
      name: 'Administration',
      code: 'ADMIN',
    });
    page.model['name'] = 'Company Administration';
    page.save();
    const request = http.expectOne('/api/v1/organization/departments/record-id');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ name: 'Company Administration', code: 'ADMIN' });
    request.flush({});
    http.expectOne('/api/v1/organization/departments').flush([]);
    expect(page.editingId).toBeNull();
    http.verify();
  });
  it('normalizes a cleared optional date and supports independent weekday selection', () => {
    const fixture = TestBed.createComponent(MasterEditor),
      http = TestBed.inject(HttpTestingController),
      page = fixture.componentInstance;
    http.expectOne('/api/v1/organization/departments').flush([]);
    page.setValue({ key: 'effective_to', label: 'Until', type: 'date' }, '');
    expect(page.model['effective_to']).toBeNull();
    page.model['working_days'] = [1, 2, 3, 4, 5];
    page.toggleDay(6);
    expect(page.isDay(6)).toBe(true);
    page.toggleDay(1);
    expect(page.isDay(1)).toBe(false);
    http.verify();
  });
});

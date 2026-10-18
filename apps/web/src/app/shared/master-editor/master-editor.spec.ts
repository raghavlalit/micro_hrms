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

describe('Numeric master fields', () => {
  const policy: MasterConfig = {
    title: 'Leave policies', endpoint: 'leave/policies', description: 'Test',
    fields: [{ key: 'annual_entitlement', label: 'Annual entitlement (days)', type: 'number', required: true, min: 0, max: 366, step: '0.01' }],
    defaults: { annual_entitlement: 0 },
  };
  beforeEach(() => TestBed.configureTestingModule({
    imports: [MasterEditor],
    providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { data: { master: policy } } } }],
  }));
  it('submits typed entitlement as a JSON number and validates empty/out-of-range input', async () => {
    const fixture = TestBed.createComponent(MasterEditor), page = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/leave/policies').flush([]);
    page.add();
    await fixture.whenStable();
    const input: HTMLInputElement = fixture.nativeElement.querySelector('input[type=number]');
    const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
    async function enter(value: string) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await fixture.whenStable();
    }
    for (const value of ['', '-1', '367']) {
      await enter(value);
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      http.expectNone(request => request.method === 'POST');
    }
    await enter('18');
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    const saved = http.expectOne('/api/v1/leave/policies');
    expect(saved.request.body.annual_entitlement).toBe(18);
    saved.flush({});
    http.expectOne('/api/v1/leave/policies').flush([]);
    http.verify();
  });
  it('converts returned decimals on edit, preserving fractions and zero', () => {
    const fixture = TestBed.createComponent(MasterEditor), page = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('/api/v1/leave/policies').flush([]);
    for (const [stored, expected] of [['18.50', 18.5], ['0.00', 0]] as const) {
      page.edit({ id: 'policy', annual_entitlement: stored });
      page.save();
      const saved = http.expectOne('/api/v1/leave/policies/policy');
      expect(saved.request.method).toBe('PUT');
      expect(saved.request.body.annual_entitlement).toBe(expected);
      saved.flush({});
      http.expectOne('/api/v1/leave/policies').flush([]);
    }
    http.verify();
  });
});

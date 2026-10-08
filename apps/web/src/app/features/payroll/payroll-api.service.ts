import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  PayrollDetail,
  PayrollItem,
  PayrollPerson,
  PayrollRun,
  Payslip,
  SalaryComponent,
  SalaryRevision,
} from './payroll.models';
@Injectable({ providedIn: 'root' })
export class PayrollApi {
  private readonly http = inject(HttpClient);
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  settings() {
    return this.http.get<{ unpaid_leave_deduction: boolean; currency: string }>(
      '/api/v1/payroll/settings',
    );
  }
  saveSettings(enabled: boolean) {
    return this.http.put(
      '/api/v1/payroll/settings',
      { unpaid_leave_deduction: enabled },
      this.options,
    );
  }
  people(search: string, page = 1) {
    return this.http.get<{ items: PayrollPerson[]; total: number }>('/api/v1/payroll/people', {
      params: { search, page, limit: 50 },
    });
  }
  components() {
    return this.http.get<SalaryComponent[]>('/api/v1/payroll/components');
  }
  salaries(id: string) {
    return this.http.get<{ employee: PayrollPerson; items: SalaryRevision[] }>(
      `/api/v1/payroll/employees/${id}/salaries`,
    );
  }
  createSalary(id: string, body: object) {
    return this.http.post(`/api/v1/payroll/employees/${id}/salaries`, body, this.options);
  }
  editSalary(id: string, body: object) {
    return this.http.put(`/api/v1/payroll/salaries/${id}`, body, this.options);
  }
  runs(page: number) {
    return this.http.get<{ items: PayrollRun[]; total: number }>('/api/v1/payroll/runs', {
      params: { page, limit: 20 },
    });
  }
  createRun(body: object) {
    return this.http.post<{ id: string }>('/api/v1/payroll/runs', body, this.options);
  }
  run(id: string) {
    return this.http.get<PayrollDetail>(`/api/v1/payroll/runs/${id}`);
  }
  version(id: string, version: number) {
    return this.http.get<{ version: number; items: PayrollItem[] }>(
      `/api/v1/payroll/runs/${id}/versions/${version}`,
    );
  }
  action(id: string, action: string, body: object) {
    return this.http.post(`/api/v1/payroll/runs/${id}/${action}`, body, this.options);
  }
  adjust(id: string, body: object) {
    return this.http.post(`/api/v1/payroll/employees/${id}/adjustments`, body, this.options);
  }
  editAdjustment(id: string, body: object) {
    return this.http.put(`/api/v1/payroll/adjustments/${id}`, body, this.options);
  }
  slips(page: number) {
    return this.http.get<{ items: Payslip[]; total: number }>('/api/v1/payslips/me', {
      params: { page, limit: 20 },
    });
  }
  slip(id: string) {
    return this.http.get<Payslip>(`/api/v1/payslips/${id}`);
  }
  download(id: string) {
    return this.http.get(`/api/v1/payslips/${id}/download`, { responseType: 'blob' });
  }
}
export function payrollError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = error.error?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return error instanceof Error ? error.message : 'Payroll request failed. Please try again.';
}

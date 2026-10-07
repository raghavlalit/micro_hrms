import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  Employee,
  EmployeeContact,
  EmployeeDetail,
  EmployeeList,
  EmployeeLookups,
  EmployeePrivate,
  EmployeeProfile,
} from './employee.models';
@Injectable({ providedIn: 'root' })
export class EmployeeApi {
  private readonly http = inject(HttpClient);
  private readonly base = '/api/v1/employees';
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  list(params: Record<string, string | number>) {
    return this.http.get<EmployeeList>(this.base, { params });
  }
  detail(id: string) {
    return this.http.get<EmployeeDetail>(`${this.base}/${id}`);
  }
  lookups() {
    return this.http.get<EmployeeLookups>(`${this.base}/lookups`);
  }
  save(profile: EmployeeProfile, id?: string) {
    const body = {
      ...profile,
      email: profile.email?.trim() || null,
      date_of_birth: profile.date_of_birth || null,
      probation_ends_on: profile.probation_ends_on || null,
    };
    return id
      ? this.http.put<Employee>(`${this.base}/${id}`, body, this.options)
      : this.http.post<Employee>(this.base, body, this.options);
  }
  saveContact(contact: EmployeeContact) {
    return this.http.put(`${this.base}/me/contact`, contact, this.options);
  }
  status(
    id: string,
    body: {
      status: string;
      reason: string;
      notice_date: string | null;
      termination_date: string | null;
    },
  ) {
    return this.http.post(`${this.base}/${id}/status`, body, this.options);
  }
  invite(id: string, role: string) {
    return this.http.post<{ invitation: { token: string; expires_at: string } }>(
      `${this.base}/${id}/invitation`,
      { role },
      this.options,
    );
  }
  privateDetails(id: string) {
    return this.http.get<EmployeePrivate>(`${this.base}/${id}/private`);
  }
  savePrivate(id: string, body: EmployeePrivate) {
    return this.http.put(`${this.base}/${id}/private`, body, this.options);
  }
}
export function employeeError(error: HttpErrorResponse) {
  const message = error.error?.message;
  return Array.isArray(message)
    ? message.join('. ')
    : message || 'Unable to complete the employee request. Please try again.';
}

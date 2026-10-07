import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import {
  AttendanceCalendar,
  AttendanceEdit,
  AttendancePerson,
  Correction,
} from './attendance.models';
@Injectable({ providedIn: 'root' })
export class AttendanceApi {
  private readonly http = inject(HttpClient);
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  calendar(month?: string, employeeId?: string) {
    return this.http.get<AttendanceCalendar>(
      employeeId ? `/api/v1/attendance/employees/${employeeId}` : '/api/v1/attendance/me',
      { params: month ? { month } : {} },
    );
  }
  people(search: string, page = 1) {
    return this.http.get<{ items: AttendancePerson[]; total: number }>(
      '/api/v1/attendance/people',
      { params: { search, page, limit: 50 } },
    );
  }
  check(out: boolean) {
    return this.http.post(
      out ? '/api/v1/attendance/check-out' : '/api/v1/attendance/check-in',
      { source: 'web' },
      this.options,
    );
  }
  submit(body: AttendanceEdit) {
    return this.http.post('/api/v1/attendance/regularizations', body, this.options);
  }
  adjust(employeeId: string, date: string, body: AttendanceEdit) {
    return this.http.put(
      `/api/v1/attendance/employees/${employeeId}/days/${date}`,
      body,
      this.options,
    );
  }
  corrections(scope: string, status: string, page: number) {
    return this.http.get<{ items: Correction[]; total: number }>(
      '/api/v1/attendance/regularizations',
      { params: { scope, page, limit: 20, ...(status ? { status } : {}) } },
    );
  }
  review(id: string, decision: string, comment: string) {
    return this.http.post(
      `/api/v1/attendance/regularizations/${id}/review`,
      { decision, comment },
      this.options,
    );
  }
}
export function attendanceError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = error.error?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return error instanceof Error ? error.message : 'Attendance request failed. Please try again.';
}

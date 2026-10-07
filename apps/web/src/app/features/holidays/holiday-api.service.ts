import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Holiday, HolidayCalendar, HolidayInput } from './holiday.models';
@Injectable({ providedIn: 'root' })
export class HolidayApi {
  private readonly http = inject(HttpClient);
  calendar(params: Record<string, string | number>) {
    return this.http.get<HolidayCalendar>('/api/v1/holidays/calendar', { params });
  }
  save(body: HolidayInput, id?: string) {
    const options = { headers: { 'X-HRMS-Request': '1' } };
    return id
      ? this.http.put<Holiday>(`/api/v1/holidays/${id}`, body, options)
      : this.http.post<Holiday>('/api/v1/holidays', body, options);
  }
}
export function holidayError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = error.error?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return 'Unable to load or save holidays. Please try again.';
}

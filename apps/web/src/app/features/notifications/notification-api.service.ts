import { inject, Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string;
  created_at: string;
  read_at: string | null;
  link: string;
}
export interface DeliveryRow {
  id: string;
  notification_id: string;
  status: string;
  attempts: number;
  error_code: string | null;
  created_at: string;
  next_attempt_at: string;
  finished_at: string | null;
}
@Injectable({ providedIn: 'root' })
export class NotificationApi {
  private readonly http = inject(HttpClient);
  readonly unread = signal<number | null>(null);
  count() {
    return this.http.get<{ unread: number }>('/api/v1/notifications/unread-count');
  }
  list(status: string, page: number) {
    return this.http.get<{ items: NotificationRow[]; total: number; unread: number }>(
      '/api/v1/notifications',
      { params: { status, page, limit: 20 } },
    );
  }
  read(id: string, read: boolean) {
    return this.http.put(
      `/api/v1/notifications/${id}/read`,
      { read },
      { headers: { 'X-HRMS-Request': '1' } },
    );
  }
  all() {
    return this.http.put(
      '/api/v1/notifications/read-all',
      {},
      { headers: { 'X-HRMS-Request': '1' } },
    );
  }
  deliveries(status: string, page: number) {
    return this.http.get<{ items: DeliveryRow[]; total: number }>(
      '/api/v1/notifications/deliveries',
      { params: { ...(status ? { status } : {}), page, limit: 20 } },
    );
  }
  retry(id: string) {
    return this.http.post(
      `/api/v1/notifications/deliveries/${id}/retry`,
      {},
      { headers: { 'X-HRMS-Request': '1' } },
    );
  }
}
export function notificationError(error: HttpErrorResponse) {
  const message = error.error?.message;
  return Array.isArray(message)
    ? message.join('. ')
    : typeof message === 'string'
      ? message
      : 'Unable to complete this request. Please try again.';
}

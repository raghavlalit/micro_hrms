import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
export interface AuditRow {
  id: string;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  created_at: string;
}
export interface AuditDetail extends AuditRow {
  details: Record<string, string | number | boolean>;
}
export interface AuditFilters {
  actor: string;
  module: string;
  action: string;
  from: string;
  to: string;
}
@Injectable({ providedIn: 'root' })
export class AuditApi {
  private readonly http = inject(HttpClient);
  list(filters: AuditFilters, page: number) {
    const params: Record<string, string | number> = { page, limit: 20 };
    for (const [key, value] of Object.entries(filters))
      if (value.trim()) params[key] = value.trim();
    return this.http.get<{ items: AuditRow[]; total: number }>('/api/v1/audit-logs', { params });
  }
  options() {
    return this.http.get<{ actions: string[]; modules: string[] }>('/api/v1/audit-logs/options');
  }
  detail(id: string) {
    return this.http.get<AuditDetail>(`/api/v1/audit-logs/${id}`);
  }
}
export function auditError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 403) return 'You no longer have permission to view company audit history.';
    if (error.status === 404) return 'This audit event is not available.';
    if (error.status === 400) return 'Check the filters and date range, then try again.';
  }
  return 'Unable to load audit history. Please try again.';
}
export function auditLabel(value: string) {
  return value.replace(/[._]/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

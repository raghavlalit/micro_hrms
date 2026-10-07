import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { AccessResult, CompanyUser, RoleCatalog } from './access.models';

@Injectable({ providedIn: 'root' })
export class AccessApi {
  private readonly http = inject(HttpClient);
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  users(params: Record<string, string | number>) {
    return this.http.get<{ items: CompanyUser[]; total: number }>('/api/v1/users', { params });
  }
  catalog() {
    return this.http.get<RoleCatalog>('/api/v1/roles');
  }
  invite(body: { display_name: string; email: string; role_ids: string[]; reason: string }) {
    return this.http.post<AccessResult>('/api/v1/users', body, this.options);
  }
  roles(id: string, role_ids: string[], reason: string) {
    return this.http.put<AccessResult>(
      `/api/v1/users/${id}/roles`,
      { role_ids, reason },
      this.options,
    );
  }
  status(id: string, status: 'enabled' | 'disabled', reason: string) {
    return this.http.put<AccessResult>(
      `/api/v1/users/${id}/status`,
      { status, reason },
      this.options,
    );
  }
  reinvite(id: string, reason: string) {
    return this.http.post<AccessResult>(`/api/v1/users/${id}/invitation`, { reason }, this.options);
  }
  saveRole(
    id: string | undefined,
    body: { code?: string; name: string; permission_codes: string[]; reason: string },
  ) {
    return id
      ? this.http.put<AccessResult>(`/api/v1/roles/${id}`, body, this.options)
      : this.http.post<AccessResult>('/api/v1/roles', body, this.options);
  }
}
export function accessError(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    const message = error.error?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
  }
  return 'Unable to complete this request. Please try again.';
}

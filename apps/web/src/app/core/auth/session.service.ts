import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
export interface SessionUser {
  id: string;
  email: string;
  kind: 'platform' | 'tenant';
  tenantId?: string;
  permissions: string[];
  mustChangePassword: boolean;
}
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  readonly user = signal<SessionUser | null>(null);
  load() {
    return this.http
      .get<{ user: SessionUser }>('/api/v1/auth/me')
      .pipe(tap((result) => this.user.set(result.user)));
  }
  logout() {
    return this.http
      .post('/api/v1/auth/logout', {}, { headers: { 'X-HRMS-Request': '1' } })
      .pipe(tap(() => this.user.set(null)));
  }
}

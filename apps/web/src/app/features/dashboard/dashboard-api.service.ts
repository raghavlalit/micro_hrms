import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dashboard } from './dashboard.models';
@Injectable({ providedIn: 'root' })
export class DashboardApi {
  private readonly http = inject(HttpClient);
  overview() {
    return this.http.get<Dashboard>('/api/v1/dashboard');
  }
}

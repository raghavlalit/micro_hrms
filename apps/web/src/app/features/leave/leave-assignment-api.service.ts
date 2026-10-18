import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AssignmentDirectory, AssignmentFilters, AssignmentJob } from './leave-assignment.models';
@Injectable({ providedIn: 'root' })
export class LeaveAssignmentApi {
  private readonly http = inject(HttpClient);
  private readonly root = '/api/v1/leave/assignments';
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  list(filters: AssignmentFilters) {
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined),
    );
    return this.http.get<AssignmentDirectory>(this.root, { params });
  }
  preview(body: object) {
    return this.http.post<AssignmentJob>(`${this.root}/preview`, body, this.options);
  }
  confirm(id: string) {
    return this.http.post<AssignmentJob>(`${this.root}/jobs/${id}/confirm`, {}, this.options);
  }
  retry(id: string) {
    return this.http.post<AssignmentJob>(`${this.root}/jobs/${id}/retry`, {}, this.options);
  }
  job(id: string, page = 1) {
    return this.http.get<AssignmentJob>(`${this.root}/jobs/${id}`, { params: { page } });
  }
  jobs() {
    return this.http.get<AssignmentJob[]>(`${this.root}/jobs`);
  }
  lookup(kind: string) {
    return this.http.get<{ id: string; name: string }[]>(`${this.root}/${kind}`);
  }
}

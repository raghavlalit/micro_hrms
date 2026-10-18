import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ReportFilters, ReportKind, ReportOptions, ReportResult } from './report.models';
import { BackgroundJobView } from '../../shared/background-job';
@Injectable({ providedIn: 'root' })
export class ReportApi {
  private readonly http = inject(HttpClient);
  options(kind: ReportKind) {
    return this.http.get<ReportOptions>('/api/v1/reports/options', { params: { kind } });
  }
  view(kind: ReportKind, params: ReportFilters) {
    return this.http.get<ReportResult>(`/api/v1/reports/${kind}`, { params });
  }
  export(kind: ReportKind, filters: ReportFilters) {
    return this.http.post(`/api/v1/reports/${kind}/export`, filters, {
      responseType: 'blob',
      headers: { 'X-HRMS-Request': '1' },
    });
  }
  queue(kind: ReportKind, filters: ReportFilters, operationId: string) {
    return this.http.post<BackgroundJobView>(
      `/api/v1/reports/${kind}/export-jobs`,
      { ...filters, operation_id: operationId },
      { headers: { 'X-HRMS-Request': '1' } },
    );
  }
  jobs(page: number) {
    return this.http.get<{ items: BackgroundJobView[]; total: number }>('/api/v1/report-exports', {
      params: { page, limit: 20 },
    });
  }
  retry(id: string) {
    return this.http.post<BackgroundJobView>(
      `/api/v1/report-exports/${id}/retry`,
      {},
      { headers: { 'X-HRMS-Request': '1' } },
    );
  }
  downloadJob(id: string) {
    return this.http.get(`/api/v1/report-exports/${id}/download`, { responseType: 'blob' });
  }
}
export async function reportError(error: HttpErrorResponse): Promise<string> {
  let detail = error.error;
  if (detail instanceof Blob) {
    try {
      detail = JSON.parse(await detail.text());
    } catch {
      detail = null;
    }
  }
  const message = detail?.message;
  return Array.isArray(message)
    ? message.join('. ')
    : typeof message === 'string'
      ? message
      : 'Unable to load the report. Please try again.';
}

import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DocumentCategory, DocumentDetail, DocumentPerson, DocumentRow } from './document.models';
@Injectable({ providedIn: 'root' })
export class DocumentApi {
  private readonly http = inject(HttpClient);
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  list(params: Record<string, string | number>) {
    return this.http.get<{ items: DocumentRow[]; total: number; today: string }>(
      '/api/v1/documents',
      { params },
    );
  }
  detail(id: string) {
    return this.http.get<DocumentDetail>(`/api/v1/documents/${id}`);
  }
  categories() {
    return this.http.get<DocumentCategory[]>('/api/v1/documents/categories');
  }
  people(search: string, page: number) {
    return this.http.get<{ items: DocumentPerson[]; total: number }>('/api/v1/documents/people', {
      params: { search, page, limit: 50 },
    });
  }
  create(body: FormData) {
    return this.http.post<{ id: string }>('/api/v1/documents', body, this.options);
  }
  upload(id: string, body: FormData) {
    return this.http.post(`/api/v1/documents/${id}/versions`, body, this.options);
  }
  update(id: string, body: object) {
    return this.http.put(`/api/v1/documents/${id}`, body, this.options);
  }
  archive(id: string, body: object, versionId?: string) {
    return this.http.post(
      `/api/v1/documents/${id}${versionId ? '/versions/' + versionId : ''}/archive`,
      body,
      this.options,
    );
  }
  download(id: string, versionId: string) {
    return this.http.get(`/api/v1/documents/${id}/versions/${versionId}/download`, {
      responseType: 'blob',
    });
  }
}
export function documentError(error: unknown) {
  if (error instanceof HttpErrorResponse) {
    const message = error.error?.message;
    if (Array.isArray(message)) return message.join('. ');
    if (typeof message === 'string') return message;
    if (error.status === 413) return 'Choose a file up to 10 MiB.';
  }
  return 'Document request failed. Please try again.';
}

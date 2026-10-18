import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { DocumentApi, documentError } from './document-api.service';
import { DocumentDetail, DocumentVersion } from './document.models';
import { DocumentDialog, DocumentDialogData } from './document-dialog';
@Component({
  imports: [RouterLink, DatePipe, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './document-detail-page.html',
  styleUrl: './documents.scss',
})
export class DocumentDetailPage {
  private readonly api = inject(DocumentApi);
  private readonly dialog = inject(MatDialog);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly manage =
    inject(SessionService).user()?.permissions.includes('documents.manage') ?? false;
  readonly data = signal<DocumentDetail | null>(null);
  readonly loading = signal(false);
  readonly downloading = signal(false);
  readonly error = signal('');
  constructor() {
    this.load();
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.detail(this.id).subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
      },
      error: (error) => {
        this.data.set(null);
        this.error.set(documentError(error));
        this.loading.set(false);
      },
    });
  }
  current() {
    return this.data()?.versions.find((version) => !version.archived_at)?.id;
  }
  action(action: DocumentDialogData['action'], version?: DocumentVersion) {
    this.dialog
      .open(DocumentDialog, {
        data: { action, document: this.data(), version },
        width: '760px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((result) => {
        if (result) this.load();
      });
  }
  download(version: DocumentVersion) {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.error.set('');
    this.api.download(this.id, version.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = version.original_filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.downloading.set(false);
      },
      error: async (error) => {
        if (error.error instanceof Blob) {
          try {
            this.error.set(JSON.parse(await error.error.text()).message || 'Download failed.');
          } catch {
            this.error.set('Download failed.');
          }
        } else this.error.set(documentError(error));
        this.downloading.set(false);
      },
    });
  }
}

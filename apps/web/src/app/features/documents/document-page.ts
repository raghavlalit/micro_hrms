import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { SessionService } from '../../core/auth/session.service';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { DocumentApi, documentError } from './document-api.service';
import { DocumentRow } from './document.models';
import { DocumentDialog } from './document-dialog';
@Component({
  imports: [FormsModule, RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './document-page.html',
  styleUrl: './documents.scss',
})
export class DocumentPage {
  private readonly api = inject(DocumentApi);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  readonly manage =
    inject(SessionService).user()?.permissions.includes('documents.manage') ?? false;
  readonly rows = signal<DocumentRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  search = '';
  status = 'active';
  expiry = 'all';
  page = 1;
  total = 0;
  today = '';
  constructor() {
    this.load();
  }
  load(reset = false) {
    if (this.loading()) return;
    if (reset) this.page = 1;
    this.loading.set(true);
    this.error.set('');
    this.api
      .list({
        search: this.search,
        status: this.status,
        expiry: this.expiry,
        page: this.page,
        limit: 20,
      })
      .subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.total = result.total;
          this.today = result.today;
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(documentError(error));
          this.loading.set(false);
        },
      });
  }
  step(step: number) {
    this.page += step;
    this.load();
  }
  upload() {
    this.dialog
      .open(DocumentDialog, { data: { action: 'create' }, width: '760px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((result) => {
        if (result?.id) this.router.navigate(['/documents', result.id]);
      });
  }
}

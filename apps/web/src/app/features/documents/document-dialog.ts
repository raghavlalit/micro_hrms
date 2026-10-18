import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { DocumentApi, documentError } from './document-api.service';
import {
  DocumentCategory,
  DocumentDetail,
  DocumentPerson,
  DocumentVersion,
} from './document.models';
export interface DocumentDialogData {
  action: 'create' | 'edit' | 'version' | 'archive';
  document?: DocumentDetail;
  version?: DocumentVersion;
}
@Component({
  imports: [FormsModule, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './document-dialog.html',
  styleUrl: './documents.scss',
})
export class DocumentDialog {
  readonly data = inject<DocumentDialogData>(MAT_DIALOG_DATA);
  private readonly api = inject(DocumentApi);
  private readonly ref = inject(MatDialogRef<DocumentDialog>);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly people = signal<DocumentPerson[]>([]);
  readonly categories = signal<DocumentCategory[]>([]);
  readonly finding = signal(false);
  readonly title = {
    create: 'Upload employee document',
    edit: 'Edit document details',
    version: 'Upload new version',
    archive: this.data.version ? 'Archive version' : 'Archive document',
  }[this.data.action];
  name = this.data.document?.title ?? '';
  employeeId = '';
  categoryId = this.data.document?.category_id ?? '';
  visibility = this.data.document?.visibility ?? 'hr_only';
  issueDate = this.data.document?.issue_date ?? '';
  expiryDate = this.data.document?.expiry_date ?? '';
  reason = '';
  search = '';
  page = 1;
  total = 0;
  file: File | null = null;
  operationId = crypto.randomUUID();
  constructor() {
    if (['create', 'edit'].includes(this.data.action))
      this.api
        .categories()
        .subscribe({
          next: (rows) => this.categories.set(rows.filter((row) => !row.archived_at)),
          error: (error) => this.error.set(documentError(error)),
        });
    if (this.data.action === 'create') this.find();
  }
  find(reset = false) {
    if (this.finding()) return;
    if (reset) this.page = 1;
    this.finding.set(true);
    this.api.people(this.search, this.page).subscribe({
      next: (result) => {
        this.people.set(result.items);
        if (!result.items.some(person => person.id === this.employeeId)) this.employeeId = '';
        this.total = result.total;
        this.finding.set(false);
      },
      error: (error) => {
        this.error.set(documentError(error));
        this.finding.set(false);
      },
    });
  }
  step(step: number) {
    this.page += step;
    this.find();
  }
  selectFile(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0] ?? null;
    this.error.set('');
    this.file = null;
    this.operationId = crypto.randomUUID();
    if (
      file &&
      (!file.size || file.size > 10 * 1024 * 1024 || !/\.(pdf|png|jpe?g)$/i.test(file.name))
    ) {
      this.error.set('Choose a nonempty PDF, PNG or JPEG up to 10 MiB.');
      return;
    }
    this.file = file;
  }
  save(form: NgForm) {
    if (form.invalid || this.busy() || this.reason.trim().length < 3) {
      form.form.markAllAsTouched();
      return;
    }
    const upload = ['create', 'version'].includes(this.data.action);
    if (upload && !this.file) {
      this.error.set('Choose a file to upload.');
      return;
    }
    if (
      ['create', 'edit'].includes(this.data.action) &&
      this.issueDate &&
      this.expiryDate &&
      this.expiryDate < this.issueDate
    ) {
      this.error.set('Expiry date cannot precede issue date.');
      return;
    }
    const base = { reason: this.reason.trim(), revision: this.data.document?.revision };
    const metadata = {
      title: this.name.trim(),
      category_id: this.categoryId,
      visibility: this.visibility,
      issue_date: this.issueDate || null,
      expiry_date: this.expiryDate || null,
    };
    let request;
    if (upload) {
      const body = new FormData();
      body.append('file', this.file!);
      const fields =
        this.data.action === 'create'
          ? {
              ...metadata,
              reason: base.reason,
              employee_id: this.employeeId,
              operation_id: this.operationId,
            }
          : { ...base, operation_id: this.operationId };
      for (const [key, value] of Object.entries(fields))
        if (value !== undefined && value !== null) body.append(key, String(value));
      request =
        this.data.action === 'create'
          ? this.api.create(body)
          : this.api.upload(this.data.document!.id, body);
    } else
      request =
        this.data.action === 'edit'
          ? this.api.update(this.data.document!.id, { ...base, ...metadata })
          : this.api.archive(this.data.document!.id, base, this.data.version?.id);
    this.busy.set(true);
    this.ref.disableClose = true;
    this.error.set('');
    request.subscribe({
      next: (result) => this.ref.close(result),
      error: (error) => {
        this.error.set(documentError(error));
        this.busy.set(false);
        this.ref.disableClose = false;
      },
    });
  }
}

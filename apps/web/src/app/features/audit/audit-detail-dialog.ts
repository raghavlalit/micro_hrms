import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe, KeyValuePipe } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AuditApi, AuditDetail, auditError, auditLabel } from './audit-api.service';
@Component({
  imports: [DatePipe, KeyValuePipe, MatDialogModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './audit-detail-dialog.html',
  styleUrl: './audit.scss',
})
export class AuditDetailDialog {
  private readonly id = inject<string>(MAT_DIALOG_DATA);
  private readonly api = inject(AuditApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly event = signal<AuditDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly label = auditLabel;
  constructor() {
    this.load();
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.event.set(null);
    this.api
      .detail(this.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (event) => {
          this.event.set(event);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(auditError(error));
          this.loading.set(false);
        },
      });
  }
}

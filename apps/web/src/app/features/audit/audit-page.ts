import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AuditApi, AuditFilters, AuditRow, auditError, auditLabel } from './audit-api.service';
import { AuditDetailDialog } from './audit-detail-dialog';

@Component({
  imports: [DatePipe, FormsModule, MatPaginatorModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './audit-page.html',
  styleUrl: './audit.scss',
})
export class AuditPage {
  private readonly api = inject(AuditApi);
  private readonly destroyRef = inject(DestroyRef);
  private readonly dialog = inject(MatDialog);
  readonly rows = signal<AuditRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly optionsError = signal('');
  readonly options = signal<{ actions: string[]; modules: string[] }>({ actions: [], modules: [] });
  readonly label = auditLabel;
  filters: AuditFilters = { actor: '', module: '', action: '', from: '', to: '' };
  private applied: AuditFilters = { ...this.filters };
  page = 1;
  total = 0;
  constructor() {
    this.loadOptions();
    this.load();
  }
  loadOptions() {
    this.optionsError.set('');
    this.api
      .options()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (options) => this.options.set(options),
        error: () => this.optionsError.set('Filter choices could not be loaded.'),
      });
  }
  actions() {
    return this.options().actions.filter(
      (action) => !this.filters.module || action.split('.')[0] === this.filters.module,
    );
  }
  apply() {
    if (this.loading()) return;
    if (this.filters.from && this.filters.to && this.filters.from > this.filters.to) {
      this.error.set('From date must not be after to date.');
      return;
    }
    this.applied = { ...this.filters };
    this.page = 1;
    this.load();
  }
  reset() {
    this.filters = { actor: '', module: '', action: '', from: '', to: '' };
    this.apply();
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.rows.set([]);
    this.total = 0;
    this.api
      .list(this.applied, this.page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.rows.set(result.items);
          this.total = result.total;
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(auditError(error));
          this.loading.set(false);
        },
      });
  }
  open(row: AuditRow) {
    this.dialog.open(AuditDetailDialog, { data: row.id, width: '680px', maxWidth: '95vw' });
  }
}

import { MATERIAL_FORM_IMPORTS } from '../ui/material';
import { AppIcon } from '../ui/app-icon';
import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MasterConfig, MasterField } from './master-config';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';

@Component({
  imports: [...MATERIAL_FORM_IMPORTS, AppIcon, FormsModule, MatCheckboxModule, MatPaginatorModule],
  templateUrl: './master-editor.html',
  styleUrl: '../workspace.scss',
})
export class MasterEditor {
  private readonly http = inject(HttpClient);
  readonly config = inject(ActivatedRoute).snapshot.data['master'] as MasterConfig;
  readonly records = signal<Record<string, unknown>[]>([]);
  readonly message = signal('');
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly failed = signal(false);
  readonly editorOpen = signal(false);
  search = '';
  statusFilter = 'all';
  pageIndex = 0;
  pageSize = 10;
  readonly lookups = signal<Record<string, { value: string; label: string }[]>>({});
  model: Record<string, unknown> = {};
  editingId: string | null = null;
  readonly days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  constructor() {
    this.reset();
    this.load();
    for (const field of this.config.fields) {
      if (field.lookup)
        this.http.get<Record<string, unknown>[]>(`/api/v1/${field.lookup}`).subscribe({
          next: (rows) =>
            this.lookups.update((current) => ({
              ...current,
              [field.key]: rows.map((row) => ({
                value: String(row['id']),
                label: String(row['name']),
              })),
            })),
          error: (error) => this.fail(error),
        });
    }
  }
  load() {
    this.loading.set(true);
    this.http.get<Record<string, unknown>[]>(`/api/v1/${this.config.endpoint}`).subscribe({
      next: (rows) => {
        this.records.set(rows);
        this.loading.set(false);
      },
      error: (error) => {
        this.loading.set(false);
        this.fail(error);
      },
    });
  }
  filteredRecords() {
    const search = this.search.trim().toLowerCase();
    return this.records().filter(
      (row) =>
        [row['name'], row['code'], row['holiday_date'], row['effective_from']].some((value) =>
          String(value ?? '')
            .toLowerCase()
            .includes(search),
        ) &&
        (this.statusFilter === 'all' ||
          (this.statusFilter === 'inactive'
            ? row['is_active'] === false
            : row['is_active'] === true)),
    );
  }
  visibleRecords() {
    return this.filteredRecords().slice(
      this.pageIndex * this.pageSize,
      (this.pageIndex + 1) * this.pageSize,
    );
  }
  hasStatus() {
    return this.config.fields.some((field) => field.key === 'is_active');
  }
  filterChanged() {
    this.pageIndex = 0;
  }
  changePage(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }
  add() {
    this.reset();
    this.message.set('');
    this.failed.set(false);
    this.editorOpen.set(true);
  }
  cancel() {
    this.reset();
    this.editorOpen.set(false);
    this.message.set('');
  }
  reset() {
    this.editingId = null;
    this.model = structuredClone(this.config.defaults);
  }
  edit(row: Record<string, unknown>) {
    this.reset();
    this.editorOpen.set(true);
    this.failed.set(false);
    this.editingId = String(row['id']);
    for (const field of this.config.fields) {
      const [parent, child] = field.key.split('.');
      const value = child ? (row[parent] as Record<string, unknown> | null)?.[child] : row[parent];
      this.setValue(field, value ?? (field.required ? '' : null));
    }
    this.message.set('');
  }
  value(field: MasterField): unknown {
    const [parent, child] = field.key.split('.');
    return child ? (this.model[parent] as Record<string, unknown>)?.[child] : this.model[parent];
  }
  setValue(field: MasterField, value: unknown) {
    if (value === '' && !field.required && (field.type === 'date' || field.type === 'select'))
      value = null;
    const [parent, child] = field.key.split('.');
    if (child)
      this.model[parent] = {
        ...((this.model[parent] as Record<string, unknown>) ?? {}),
        [child]: value,
      };
    else this.model[parent] = value;
  }
  isDay(day: number) {
    return ((this.model['working_days'] as number[]) ?? []).includes(day);
  }
  toggleDay(day: number) {
    const days = new Set((this.model['working_days'] as number[]) ?? []);
    days.has(day) ? days.delete(day) : days.add(day);
    this.model['working_days'] = [...days].sort();
  }
  options(field: MasterField) {
    return field.options ?? this.lookups()[field.key] ?? [];
  }
  save() {
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.message.set('');
    const path = `/api/v1/${this.config.endpoint}${this.editingId ? '/' + this.editingId : ''}`;
    const options = { headers: { 'X-HRMS-Request': '1' } };
    const request = this.editingId
      ? this.http.put(path, this.model, options)
      : this.http.post(path, this.model, options);
    request.subscribe({
      next: () => {
        this.busy.set(false);
        this.message.set('Saved for your company.');
        this.reset();
        this.editorOpen.set(false);
        this.pageIndex = 0;
        this.load();
      },
      error: (error) => this.fail(error),
    });
  }
  private fail(error: HttpErrorResponse) {
    this.failed.set(true);
    this.busy.set(false);
    const m = error.error?.message;
    this.message.set(
      Array.isArray(m) ? m.join('. ') : m || 'Unable to load or save these settings.',
    );
  }
}

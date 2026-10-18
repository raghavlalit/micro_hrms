import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { SessionService } from '../../core/auth/session.service';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { ReportApi, reportError } from './report-api.service';
import {
  ReportKind,
  ReportOptions,
  ReportResult,
  ReportFilters,
  REPORT_LABELS,
} from './report.models';
@Component({
  imports: [FormsModule, DatePipe, RouterLink, MatPaginatorModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './report-page.html',
  styleUrl: './reports.scss',
})
export class ReportPage {
  readonly api = inject(ReportApi);
  readonly labels = REPORT_LABELS;
  readonly options = signal<ReportOptions | null>(null);
  readonly result = signal<ReportResult | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly kinds: ReportKind[];
  kind: ReportKind = 'employees';
  search = '';
  department = '';
  location = '';
  status = '';
  from = '';
  to = '';
  year = new Date().getFullYear();
  run = '';
  page = 1;
  limit = 20;
  // Pagination/export use the last applied filters, never a half-edited form.
  applied: ReportFilters = {};
  private exportOperation = '';
  constructor() {
    const permissions = inject(SessionService).user()?.permissions ?? [];
    const has = (p: string) => permissions.includes(p);
    const can = (company: string, team: string) =>
      (has('reports.read.company') && has(company)) ||
      ((has('reports.read.team') || has('reports.read.company')) && has(team));
    this.kinds = (Object.keys(this.labels) as ReportKind[]).filter((kind) =>
      kind === 'employees'
        ? can('employees.manage', 'employees.read.team')
        : kind === 'attendance'
          ? can('attendance.manage', 'attendance.approve.team')
          : kind === 'leave' || kind === 'balances'
            ? can('leave.manage', 'leave.approve.team')
            : has('reports.read.company') && has('payroll.manage'),
    );
    if (this.kinds.length) {
      this.kind = this.kinds[0];
      this.changeKind();
    }
  }
  get dated() {
    return this.kind === 'attendance' || this.kind === 'leave';
  }
  get payroll() {
    return this.kind === 'payroll' || this.kind === 'components';
  }
  statuses() {
    return this.kind === 'employees'
      ? ['invited', 'active', 'on_notice', 'inactive', 'terminated']
      : this.kind === 'leave'
        ? ['pending', 'approved', 'rejected', 'cancelled']
        : this.kind === 'attendance'
          ? [
              'present',
              'absent',
              'half_day',
              'leave',
              'holiday',
              'weekly_off',
              'pending',
              'incomplete',
              'not_applicable',
            ]
          : [];
  }
  changeKind() {
    if (this.busy()) return;
    this.result.set(null);
    this.options.set(null);
    this.error.set('');
    this.notice.set('');
    this.status = '';
    this.run = '';
    this.department = '';
    this.location = '';
    this.search = '';
    this.applied = {};
    this.exportOperation = '';
    this.page = 1;
    this.busy.set(true);
    this.api.options(this.kind).subscribe({
      next: (options) => {
        this.options.set(options);
        this.from = options.today.slice(0, 7) + '-01';
        this.to = options.today;
        this.year = Number(options.today.slice(0, 4));
        this.run = options.runs[0]?.id ?? '';
        this.busy.set(false);
        if (!this.payroll || this.run) this.load(true);
      },
      error: (error) => {
        void this.fail(error);
      },
    });
  }
  filters(): ReportFilters {
    const filters: ReportFilters = {};
    if (this.search.trim()) filters['search'] = this.search.trim();
    if (this.department) filters['department_id'] = this.department;
    if (this.location) filters['location_id'] = this.location;
    if (this.status) filters['status'] = this.status;
    if (this.dated) {
      filters['from'] = this.from;
      filters['to'] = this.to;
    }
    if (this.kind === 'balances') filters['year'] = this.year;
    if (this.payroll) filters['run_id'] = this.run;
    return filters;
  }
  load(reset = false) {
    if (this.busy()) return;
    if (reset) {
      this.page = 1;
      this.applied = this.filters();
      this.exportOperation = '';
    }
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.result.set(null);
    this.api.view(this.kind, { ...this.applied, page: this.page, limit: this.limit }).subscribe({
      next: (result) => {
        this.result.set(result);
        this.busy.set(false);
      },
      error: (error) => {
        void this.fail(error);
      },
    });
  }
  paginate(event: PageEvent) {
    this.page = event.pageIndex + 1;
    this.limit = event.pageSize;
    this.load();
  }
  download() {
    if (this.busy() || !this.result()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.export(this.kind, this.applied).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${this.kind}-${this.options()!.today}.csv`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.busy.set(false);
        this.notice.set('CSV downloaded with all matching rows.');
      },
      error: (error) => {
        void this.fail(error);
      },
    });
  }
  queue() {
    if (this.busy() || !this.options()) return;
    this.exportOperation ||= crypto.randomUUID();
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.queue(this.kind, this.applied, this.exportOperation).subscribe({
      next: () => {
        this.busy.set(false);
        this.exportOperation = '';
        this.notice.set('Export queued. Open My exports to track progress and download the file.');
      },
      error: (error) => {
        void this.fail(error);
      },
    });
  }
  private async fail(error: Parameters<typeof reportError>[0]) {
    this.error.set(await reportError(error));
    this.busy.set(false);
  }
}

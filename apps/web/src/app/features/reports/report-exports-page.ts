import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatPaginatorModule } from '@angular/material/paginator';
import { timer } from 'rxjs';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { BackgroundJobView, jobError } from '../../shared/background-job';
import { ReportApi, reportError } from './report-api.service';
import { REPORT_LABELS, ReportKind } from './report.models';
@Component({
  imports: [DatePipe, RouterLink, MatPaginatorModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './report-exports-page.html',
  styleUrl: './reports.scss',
})
export class ReportExportsPage {
  private readonly api = inject(ReportApi);
  private readonly destroyRef = inject(DestroyRef);
  readonly rows = signal<BackgroundJobView[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  readonly failure = jobError;
  page = 1;
  total = 0;
  constructor() {
    this.load();
    timer(10000, 10000)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.load());
  }
  label(job: BackgroundJobView) {
    return REPORT_LABELS[job.report_type as ReportKind] ?? 'Report';
  }
  load() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api
      .jobs(this.page)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.rows.set(data.items);
          this.total = data.total;
          this.busy.set(false);
        },
        error: (error) => {
          this.rows.set([]);
          this.total = 0;
          void this.fail(error);
        },
      });
  }
  retry(job: BackgroundJobView) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .retry(job.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.notice.set('Export queued for another attempt.');
          this.load();
        },
        error: (error) => {
          void this.fail(error);
        },
      });
  }
  download(job: BackgroundJobView) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.notice.set('');
    this.api
      .downloadJob(job.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          const url = URL.createObjectURL(blob),
            link = document.createElement('a');
          link.href = url;
          link.download = `${job.report_type}-${job.id}.csv`;
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          this.busy.set(false);
          this.notice.set('CSV downloaded.');
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

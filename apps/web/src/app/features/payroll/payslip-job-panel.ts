import { Component, DestroyRef, OnInit, inject, input, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, exhaustMap, catchError, of } from 'rxjs';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { PayrollApi } from './payroll-api.service';
import { BackgroundJobView, jobError } from '../../shared/background-job';
@Component({
  selector: 'app-payslip-job-panel',
  imports: [MatProgressBarModule],
  template: `@if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (job(); as item) {
      <div class="job" role="status">
        <strong>Payslip generation: {{ item.status }}</strong>
        @if (item.status === 'pending' || item.status === 'running') {
          <p>
            {{ item.completed_units }} of {{ item.total_units || '—' }} PDFs generated. You can
            leave this page and return later.
          </p>
          <mat-progress-bar
            [mode]="item.total_units ? 'determinate' : 'indeterminate'"
            [value]="item.total_units ? (item.completed_units / item.total_units) * 100 : 0"
            aria-label="Payslip generation progress"
          />
        }
        @if (item.status === 'failed') {
          <p>{{ failure(item.error_code) }} Use Retry generation to try again.</p>
        }
        @if (item.status === 'completed') {
          <p>All payslips are published and available to authorized employees.</p>
        }
      </div>
    }`,
  styles: `
    .job {
      margin-top: 20px;
      padding: 16px;
      border-radius: 8px;
      background: #f2f7f5;
      font-size: 13px;
    }
    p {
      line-height: 1.6;
    }
  `,
})
export class PayslipJobPanel implements OnInit {
  readonly runId = input.required<string>();
  readonly published = input(false);
  readonly changed = output<string>();
  readonly completed = output<void>();
  readonly job = signal<BackgroundJobView | null>(null);
  readonly error = signal('');
  readonly failure = jobError;
  private readonly api = inject(PayrollApi);
  private readonly destroyRef = inject(DestroyRef);
  private notified = false;
  ngOnInit() {
    timer(0, 5000)
      .pipe(
        exhaustMap(() =>
          this.api.generation(this.runId()).pipe(
            catchError(() => {
              this.error.set('Unable to refresh generation status. It will retry automatically.');
              this.job.set(null);
              return of(null);
            }),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (!result) return;
        this.error.set('');
        this.job.set(result.job);
        this.changed.emit(result.job?.status ?? '');
        if (result.job?.status === 'completed' && !this.published() && !this.notified) {
          this.notified = true;
          this.completed.emit();
        }
      });
  }
}

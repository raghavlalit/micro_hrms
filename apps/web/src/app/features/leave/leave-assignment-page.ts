import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeaveAssignmentApi } from './leave-assignment-api.service';
import {
  AssignmentDirectory,
  AssignmentEmployee,
  AssignmentFilters,
  AssignmentJob,
} from './leave-assignment.models';
import { LeavePolicyOption } from './leave.models';
import { LeaveAdminDialog } from './leave-admin-dialog';
import { LeaveBulkDialog } from './leave-bulk-dialog';
@Component({
  imports: [FormsModule, RouterLink, MatCheckboxModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './leave-assignment-page.html',
  styleUrls: ['./leave.scss', './leave-assignment-page.scss'],
})
export class LeaveAssignmentPage {
  private readonly api = inject(LeaveAssignmentApi);
  private readonly dialog = inject(MatDialog);
  readonly data = signal<AssignmentDirectory | null>(null);
  readonly jobs = signal<AssignmentJob[]>([]);
  readonly job = signal<AssignmentJob | null>(null);
  readonly policies = signal<LeavePolicyOption[]>([]);
  readonly departments = signal<{ id: string; name: string }[]>([]);
  readonly locations = signal<{ id: string; name: string }[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly selected = signal(new Set<string>());
  readonly allMatching = signal(false);
  filters: AssignmentFilters = { year: new Date().getFullYear(), page: 1, limit: 20 };
  // Selection always refers to the last loaded filters, not unsubmitted form edits.
  applied: AssignmentFilters = { ...this.filters };
  jobPage = 1;
  readonly labels: Record<string, string> = {
    total: 'Eligible employees',
    assigned: 'Fully assigned',
    partial: 'Partially assigned',
    unassigned: 'Not assigned',
    not_applicable: 'No applicable policy',
  };
  readonly cards = ['total', 'assigned', 'partial', 'unassigned', 'not_applicable'];
  constructor() {
    const router = inject(Router);
    if (!inject(SessionService).user()?.permissions.includes('leave.manage')) {
      void router.navigateByUrl('/leave/balances', { replaceUrl: true });
      return;
    }
    inject(LeaveApi)
      .policies()
      .subscribe({
        next: (rows) => this.policies.set(rows),
        error: (e) => this.error.set(leaveError(e)),
      });
    this.api.lookup('departments').subscribe({
      next: (rows) => this.departments.set(rows),
      error: (e) => this.error.set(leaveError(e)),
    });
    this.api.lookup('locations').subscribe({
      next: (rows) => this.locations.set(rows),
      error: (e) => this.error.set(leaveError(e)),
    });
    this.load();
    this.loadJobs();
    const timer = setInterval(() => {
      if (this.jobs().some((j) => ['pending', 'running'].includes(j.status))) this.loadJobs();
    }, 5000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }
  apply() {
    if (this.busy()) return;
    if (
      !Number.isInteger(this.filters.year) ||
      this.filters.year < 1900 ||
      this.filters.year > 2200
    ) {
      this.error.set('Choose a year between 1900 and 2200');
      return;
    }
    this.filters.page = 1;
    this.applied = { ...this.filters };
    this.clear();
    this.load();
  }
  load() {
    if (this.busy()) return;
    if (
      !Number.isInteger(this.applied.year) ||
      this.applied.year < 1900 ||
      this.applied.year > 2200
    ) {
      this.error.set('Choose a year between 1900 and 2200');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.data.set(null);
    this.api.list(this.applied).subscribe({
      next: (rows) => {
        this.data.set(rows);
        this.busy.set(false);
      },
      error: (e) => {
        this.error.set(leaveError(e));
        this.busy.set(false);
      },
    });
  }
  page(step: number) {
    this.applied = { ...this.applied, page: this.applied.page + step };
    this.load();
  }
  clear() {
    this.selected.set(new Set());
    this.allMatching.set(false);
  }
  toggle(id: string, checked: boolean) {
    if (this.allMatching()) this.clear();
    const ids = new Set(this.selected());
    checked ? ids.add(id) : ids.delete(id);
    this.selected.set(ids);
  }
  pageSelected() {
    return (
      this.allMatching() ||
      (!!this.data()?.items.length &&
        this.data()!.items.every((row) => this.selected().has(row.id)))
    );
  }
  selectPage(checked: boolean) {
    this.allMatching.set(false);
    const ids = new Set(this.selected());
    for (const row of this.data()?.items ?? []) checked ? ids.add(row.id) : ids.delete(row.id);
    this.selected.set(ids);
  }
  count() {
    return this.allMatching() ? (this.data()?.total ?? 0) : this.selected().size;
  }
  assign(row: AssignmentEmployee) {
    this.dialog
      .open(LeaveAdminDialog, {
        data: { employeeId: row.id, name: row.name, year: this.applied.year },
        width: '600px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.success.set('Leave entitlement assigned.');
          this.load();
        }
      });
  }
  bulk() {
    this.dialog
      .open(LeaveBulkDialog, {
        data: {
          filters: { ...this.applied },
          allMatching: this.allMatching(),
          ids: [...this.selected()],
          count: this.count(),
        },
        width: '740px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((job: AssignmentJob | undefined) => {
        if (job) {
          this.clear();
          this.job.set(job);
          this.jobPage = 1;
          this.success.set(
            'Assignment queued. Progress appears below; the background worker must be running.',
          );
          this.loadJobs();
        }
      });
  }
  loadJobs() {
    this.api.jobs().subscribe({
      next: (rows) => {
        const completed = rows.some(
          (row) =>
            row.status === 'completed' &&
            this.jobs().some((old) => old.id === row.id && old.status !== 'completed'),
        );
        this.jobs.set(rows);
        if (completed) this.load();
        const current = this.job();
        if (current && ['pending', 'running'].includes(current.status))
          this.showJob(current.id, this.jobPage);
      },
      error: (e) => this.error.set(leaveError(e)),
    });
  }
  showJob(id: string, page = 1) {
    this.api.job(id, page).subscribe({
      next: (job) => {
        this.job.set(job);
        this.jobPage = page;
      },
      error: (e) => this.error.set(leaveError(e)),
    });
  }
  retry(id: string) {
    this.api.retry(id).subscribe({
      next: (job) => {
        this.job.set(job);
        this.loadJobs();
      },
      error: (e) => this.error.set(leaveError(e)),
    });
  }
}

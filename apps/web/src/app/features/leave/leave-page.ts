import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { LeaveApi, leaveError } from './leave-api.service';
import { LeaveBalance, LeaveEntry, LeaveOverview, LeavePerson } from './leave.models';
import { LeaveAdminDialog } from './leave-admin-dialog';
import { LeaveApplyDialog } from './leave-apply-dialog';
@Component({
  imports: [FormsModule, DatePipe, RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './leave-page.html',
  styleUrl: './leave.scss',
})
export class LeavePage {
  private readonly api = inject(LeaveApi);
  private readonly dialog = inject(MatDialog);
  readonly session = inject(SessionService);
  readonly data = signal<LeaveOverview | null>(null);
  readonly people = signal<LeavePerson[]>([]);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly peopleBusy = signal(false);
  readonly success = signal('');
  readonly ledger = signal<LeaveEntry[] | null>(null);
  ledgerId = '';
  ledgerPage = 1;
  ledgerTotal = 0;
  readonly ledgerBusy = signal(false);
  year = new Date().getFullYear();
  employeeId = '';
  search = '';
  peoplePage = 1;
  peopleTotal = 0;
  mode = this.manages() || !this.selfAllowed() ? 'team' : 'self';
  manages() {
    return !!this.session.user()?.permissions.includes('leave.manage');
  }
  selfAllowed() {
    return !!this.session.user()?.permissions.includes('leave.self');
  }
  teamAllowed() {
    return this.manages() || !!this.session.user()?.permissions.includes('leave.approve.team');
  }
  constructor() {
    if (this.mode === 'self') this.load();
    if (this.teamAllowed()) this.loadPeople();
  }
  loadPeople() {
    if (this.peopleBusy()) return;
    this.peopleBusy.set(true);
    this.api.people(this.search, this.peoplePage).subscribe({
      next: (result) => {
        this.people.set(result.items);
        this.peopleTotal = result.total;
        this.peopleBusy.set(false);
        if (this.mode === 'team' && !result.items.some((p) => p.id === this.employeeId)) {
          this.employeeId = result.items[0]?.id ?? '';
          this.data.set(null);
          if (this.employeeId) this.load();
        }
      },
      error: (error) => {
        this.error.set(leaveError(error));
        this.peopleBusy.set(false);
      },
    });
  }
  searchPeople() {
    this.peoplePage = 1;
    this.loadPeople();
  }
  stepPeople(step: number) {
    this.peoplePage += step;
    this.loadPeople();
  }
  switchMode() {
    this.data.set(null);
    if (this.mode === 'team' && !this.employeeId) this.employeeId = this.people()[0]?.id ?? '';
    this.load();
  }
  load() {
    if (this.loading() || (this.mode === 'team' && !this.employeeId)) return;
    if (!Number.isInteger(this.year) || this.year < 1900 || this.year > 2200) {
      this.error.set('Choose a year between 1900 and 2200');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    this.ledger.set(null);
    this.api.overview(this.year, this.mode === 'team' ? this.employeeId : undefined).subscribe({
      next: (result) => {
        this.data.set(result);
        this.loading.set(false);
      },
      error: (error) => {
        this.data.set(null);
        this.error.set(leaveError(error));
        this.loading.set(false);
      },
    });
  }
  apply() {
    const data = this.data();
    if (!data) return;
    this.dialog
      .open(LeaveApplyDialog, { data, width: '660px', maxWidth: '96vw' })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.success.set('Leave request submitted for approval.');
          this.load();
        }
      });
  }
  setup(balance?: LeaveBalance) {
    const data = this.data();
    if (!data) return;
    this.dialog
      .open(LeaveAdminDialog, {
        data: {
          employeeId: data.employee.id,
          name: data.employee.name,
          year: data.year,
          balanceId: balance?.id,
        },
        width: '600px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.success.set('Leave balance updated.');
          this.load();
        }
      });
  }
  showLedger(id: string, page = 1) {
    if (this.ledgerBusy()) return;
    this.ledgerId = id;
    this.ledgerPage = page;
    this.ledgerBusy.set(true);
    this.api.entries(id, page).subscribe({
      next: (result) => {
        this.ledger.set(result.items);
        this.ledgerTotal = result.total;
        this.ledgerBusy.set(false);
      },
      error: (error) => {
        this.error.set(leaveError(error));
        this.ledgerBusy.set(false);
      },
    });
  }
}

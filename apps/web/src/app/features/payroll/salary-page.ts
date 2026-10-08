import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PayrollApi, payrollError } from './payroll-api.service';
import { PayrollPerson, SalaryRevision } from './payroll.models';
import { SalaryDialog } from './salary-dialog';
@Component({
  imports: [FormsModule, RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './salary-page.html',
  styleUrl: './payroll.scss',
})
export class SalaryPage {
  private readonly api = inject(PayrollApi);
  private readonly dialog = inject(MatDialog);
  readonly people = signal<PayrollPerson[]>([]);
  readonly employee = signal<PayrollPerson | null>(null);
  readonly rows = signal<SalaryRevision[]>([]);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly peopleBusy = signal(false);
  search = '';
  employeeId = '';
  page = 1;
  total = 0;
  constructor() {
    this.loadPeople();
  }
  loadPeople() {
    if (this.peopleBusy()) return;
    this.peopleBusy.set(true);
    this.api.people(this.search, this.page).subscribe({
      next: (result) => {
        this.people.set(result.items);
        this.total = result.total;
        this.peopleBusy.set(false);
        if (!result.items.some((p) => p.id === this.employeeId)) {
          this.employeeId = result.items[0]?.id ?? '';
          this.employee.set(null);
          this.rows.set([]);
          if (this.employeeId) this.load();
        }
      },
      error: (error) => {
        this.error.set(payrollError(error));
        this.peopleBusy.set(false);
      },
    });
  }
  find() {
    this.page = 1;
    this.loadPeople();
  }
  step(step: number) {
    this.page += step;
    this.loadPeople();
  }
  load() {
    if (this.loading() || !this.employeeId) return;
    this.loading.set(true);
    this.error.set('');
    this.api.salaries(this.employeeId).subscribe({
      next: (result) => {
        this.employee.set(result.employee);
        this.rows.set(result.items);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(payrollError(error));
        this.rows.set([]);
        this.loading.set(false);
      },
    });
  }
  edit(revision?: SalaryRevision) {
    const employee = this.employee();
    if (!employee) return;
    this.dialog
      .open(SalaryDialog, {
        data: { employeeId: employee.id, name: employee.name, revision },
        width: '760px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }
}

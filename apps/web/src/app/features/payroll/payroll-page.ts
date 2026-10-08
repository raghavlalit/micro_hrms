import { Component, inject, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PayrollApi, payrollError } from './payroll-api.service';
import { PayrollRun } from './payroll.models';
@Component({
  imports: [FormsModule, RouterLink, MatCheckboxModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './payroll-page.html',
  styleUrl: './payroll.scss',
})
export class PayrollPage {
  private readonly api = inject(PayrollApi);
  private readonly router = inject(Router);
  readonly rows = signal<PayrollRun[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly settingsReady = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  enabled = false;
  currency = '';
  month = '';
  payDate = '';
  page = 1;
  total = 0;
  constructor() {
    this.load();
    this.api.settings().subscribe({
      next: (result) => {
        this.enabled = result.unpaid_leave_deduction;
        this.currency = result.currency;
        this.settingsReady.set(true);
      },
      error: (error) => this.error.set(payrollError(error)),
    });
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.api.runs(this.page).subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.total = result.total;
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(payrollError(error));
        this.loading.set(false);
      },
    });
  }
  step(step: number) {
    this.page += step;
    this.load();
  }
  saveSettings() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    this.api.saveSettings(this.enabled).subscribe({
      next: () => {
        this.success.set('Payroll settings saved for new runs.');
        this.busy.set(false);
      },
      error: (error) => {
        this.error.set(payrollError(error));
        this.busy.set(false);
      },
    });
  }
  create(form: NgForm) {
    if (form.invalid || this.busy()) {
      form.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set('');
    this.api.createRun({ month: this.month, pay_date: this.payDate }).subscribe({
      next: (result) => this.router.navigate(['/payroll/runs', result.id]),
      error: (error) => {
        this.error.set(payrollError(error));
        this.busy.set(false);
      },
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PayrollApi, payrollError } from './payroll-api.service';
import { Payslip } from './payroll.models';
@Component({
  imports: [RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './payslip-page.html',
  styleUrl: './payroll.scss',
})
export class PayslipPage {
  private readonly api = inject(PayrollApi);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id');
  readonly rows = signal<Payslip[]>([]);
  readonly data = signal<Payslip | null>(null);
  readonly error = signal('');
  readonly loading = signal(false);
  readonly downloading = signal(false);
  page = 1;
  total = 0;
  constructor() {
    this.load();
  }
  load() {
    this.loading.set(true);
    if (this.id) {
      this.api.slip(this.id).subscribe({
        next: (result) => {
          this.data.set(result);
          this.loading.set(false);
        },
        error: (error) => {
          this.error.set(payrollError(error));
          this.loading.set(false);
        },
      });
    } else {
      this.api.slips(this.page).subscribe({
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
  }
  step(step: number) {
    this.page += step;
    this.load();
  }
  download(id: string) {
    if (this.downloading()) return;
    this.downloading.set(true);
    this.error.set('');
    this.api.download(id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob),
          link = document.createElement('a');
        link.href = url;
        link.download = `payslip-${id}.pdf`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        this.downloading.set(false);
      },
      error: (error) => {
        this.error.set(payrollError(error));
        this.downloading.set(false);
      },
    });
  }
}

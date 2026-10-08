import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { PayrollApi, payrollError } from './payroll-api.service';
import { PayrollDetail, PayrollItem, PayrollLine } from './payroll.models';
import { PayrollActionData, PayrollActionDialog } from './payroll-action-dialog';
@Component({
  imports: [FormsModule, RouterLink, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './payroll-run-page.html',
  styleUrl: './payroll.scss',
})
export class PayrollRunPage {
  private readonly api = inject(PayrollApi);
  private readonly dialog = inject(MatDialog);
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id')!;
  readonly data = signal<PayrollDetail | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly oldItems = signal<PayrollItem[] | null>(null);
  version = 0;
  constructor() {
    this.load();
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.oldItems.set(null);
    this.api.run(this.id).subscribe({
      next: (result) => {
        this.data.set(result);
        this.version = result.run.calculation_version;
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(payrollError(error));
        this.loading.set(false);
      },
    });
  }
  action(action: PayrollActionData['action'], item?: PayrollItem, line?: PayrollLine) {
    const data = this.data();
    if (!data) return;
    this.dialog
      .open(PayrollActionDialog, {
        data: { action, run: data.run, item, line },
        width: '620px',
        maxWidth: '96vw',
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) this.load();
      });
  }
  history() {
    if (this.version === this.data()?.run.calculation_version) {
      this.oldItems.set(null);
      return;
    }
    this.loading.set(true);
    this.api.version(this.id, this.version).subscribe({
      next: (result) => {
        this.oldItems.set(result.items);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(payrollError(error));
        this.loading.set(false);
      },
    });
  }
}

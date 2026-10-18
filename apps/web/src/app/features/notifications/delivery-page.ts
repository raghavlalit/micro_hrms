import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { NotificationApi, DeliveryRow, notificationError } from './notification-api.service';
@Component({
  imports: [DatePipe, FormsModule, RouterLink, MatPaginatorModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './delivery-page.html',
  styleUrl: './notifications.scss',
})
export class DeliveryPage {
  readonly api = inject(NotificationApi);
  readonly rows = signal<DeliveryRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  status = 'failed';
  page = 1;
  total = 0;
  constructor() {
    this.load();
  }
  load(reset = false) {
    if (this.loading()) return;
    if (reset) this.page = 1;
    this.loading.set(true);
    this.error.set('');
    this.rows.set([]);
    this.api.deliveries(this.status, this.page).subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.total = result.total;
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(notificationError(error));
        this.loading.set(false);
      },
    });
  }
  retry(row: DeliveryRow) {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.retry(row.id).subscribe({
      next: () => {
        this.loading.set(false);
        this.notice.set('Delivery queued for another attempt.');
        this.load();
      },
      error: (error) => {
        this.error.set(notificationError(error));
        this.loading.set(false);
      },
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { SessionService } from '../../core/auth/session.service';
import { NotificationApi, NotificationRow, notificationError } from './notification-api.service';
@Component({
  imports: [DatePipe, FormsModule, RouterLink, MatPaginatorModule, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './notification-page.html',
  styleUrl: './notifications.scss',
})
export class NotificationPage {
  readonly api = inject(NotificationApi);
  readonly admin = inject(SessionService).user()?.permissions.includes('company.manage');
  readonly rows = signal<NotificationRow[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly notice = signal('');
  status = 'all';
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
    this.api.list(this.status, this.page).subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.total = result.total;
        this.api.unread.set(result.unread);
        this.loading.set(false);
        if (this.page > 1 && !result.items.length) {
          this.page--;
          this.load();
        }
      },
      error: (error) => {
        this.error.set(notificationError(error));
        this.loading.set(false);
      },
    });
  }
  read(row: NotificationRow) {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.notice.set('');
    this.api.read(row.id, !row.read_at).subscribe({
      next: () => {
        this.loading.set(false);
        this.notice.set(row.read_at ? 'Marked unread.' : 'Marked read.');
        this.load();
      },
      error: (error) => {
        this.error.set(notificationError(error));
        this.loading.set(false);
      },
    });
  }
  all() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.all().subscribe({
      next: () => {
        this.loading.set(false);
        this.notice.set('All current notifications marked read.');
        this.load(true);
      },
      error: (error) => {
        this.error.set(notificationError(error));
        this.loading.set(false);
      },
    });
  }
}

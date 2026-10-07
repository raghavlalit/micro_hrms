import { Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { forkJoin } from 'rxjs';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AppIcon } from '../../shared/ui/app-icon';
import { SessionService } from '../../core/auth/session.service';
import { AccessApi, accessError } from './access-api.service';
import { AccessRole, CompanyUser } from './access.models';
import { UserActionData, UserActionDialog } from './user-action-dialog';

@Component({
  imports: [
    ReactiveFormsModule,
    DatePipe,
    RouterLink,
    MatPaginatorModule,
    AppIcon,
    ...MATERIAL_FORM_IMPORTS,
  ],
  templateUrl: './user-list-page.html',
  styleUrl: './users.scss',
})
export class UserListPage {
  private readonly api = inject(AccessApi);
  private readonly dialog = inject(MatDialog);
  readonly session = inject(SessionService);
  readonly rows = signal<CompanyUser[]>([]);
  readonly roles = signal<AccessRole[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  readonly invitation = signal('');
  readonly expires = signal('');
  readonly filters = inject(FormBuilder).nonNullable.group({ search: '', status: '', role_id: '' });
  page = 0;
  pageSize = 20;
  total = 0;
  constructor() {
    this.load();
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    const params: Record<string, string | number> = { page: this.page + 1, limit: this.pageSize };
    for (const [key, value] of Object.entries(this.filters.getRawValue()))
      if (value.trim()) params[key] = value.trim();
    forkJoin({ users: this.api.users(params), catalog: this.api.catalog() }).subscribe({
      next: ({ users, catalog }) => {
        this.rows.set(users.items);
        this.total = users.total;
        this.roles.set(catalog.roles);
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(accessError(error));
        this.rows.set([]);
        this.total = 0;
        this.loading.set(false);
      },
    });
  }
  apply() {
    this.page = 0;
    this.load();
  }
  reset() {
    this.filters.reset();
    this.apply();
  }
  paginate(event: PageEvent) {
    this.page = event.pageIndex;
    this.pageSize = event.pageSize;
    this.load();
  }
  manageable(user: CompanyUser) {
    return (
      user.id !== this.session.user()?.id &&
      user.roles.every((role) => this.roles().some((r) => r.id === role.id && r.can_assign))
    );
  }
  action(action: UserActionData['action'], user?: CompanyUser) {
    this.invitation.set('');
    this.success.set('');
    this.dialog
      .open(UserActionDialog, {
        width: '540px',
        maxWidth: '96vw',
        data: { action, user, roles: this.roles() },
      })
      .afterClosed()
      .subscribe((result) => {
        if (!result) return;
        this.success.set('User access updated successfully.');
        if (result.invitation) {
          this.invitation.set(`${window.location.origin}/activate#${result.invitation.token}`);
          this.expires.set(result.invitation.expires_at);
        }
        this.load();
      });
  }
}

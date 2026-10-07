import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AppIcon } from '../../shared/ui/app-icon';
import { AccessApi, accessError } from './access-api.service';
import { AccessRole, RoleCatalog } from './access.models';
import { RoleEditorDialog } from './role-editor-dialog';

@Component({
  imports: [RouterLink, AppIcon, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './roles-page.html',
  styleUrl: './users.scss',
})
export class RolesPage {
  private readonly api = inject(AccessApi);
  private readonly dialog = inject(MatDialog);
  readonly catalog = signal<RoleCatalog>({ roles: [], permissions: [] });
  readonly selected = signal<AccessRole | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly success = signal('');
  constructor() {
    this.load();
  }
  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.catalog().subscribe({
      next: (catalog) => {
        this.catalog.set(catalog);
        this.selected.set(
          catalog.roles.find((r) => r.id === this.selected()?.id) ?? catalog.roles[0] ?? null,
        );
        this.loading.set(false);
      },
      error: (error) => {
        this.error.set(accessError(error));
        this.loading.set(false);
      },
    });
  }
  edit(role?: AccessRole) {
    this.dialog
      .open(RoleEditorDialog, {
        width: '720px',
        maxWidth: '96vw',
        data: { role, permissions: this.catalog().permissions },
      })
      .afterClosed()
      .subscribe((saved) => {
        if (saved) {
          this.success.set('Role saved successfully.');
          this.load();
        }
      });
  }
  description(code: string) {
    return this.catalog().permissions.find((p) => p.code === code)?.description ?? code;
  }
}

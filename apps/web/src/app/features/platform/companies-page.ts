import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AppIcon } from '../../shared/ui/app-icon';
import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmDialog } from '../../shared/ui/confirm-dialog';
import { CompanyProfileFields, emptyCompanyProfile } from '../../shared/company-profile-fields';

interface Company {
  id: string;
  name: string;
  slug: string;
  status: string;
  admin_email: string;
}
interface Invitation {
  token: string;
  expires_at: string;
}
@Component({
  imports: [
    ...MATERIAL_FORM_IMPORTS,
    AppIcon,
    FormsModule,
    CompanyProfileFields,
    MatPaginatorModule,
  ],
  templateUrl: './companies-page.html',
  styleUrl: '../../shared/workspace.scss',
})
export class CompaniesPage {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(MatDialog);
  readonly creating = signal(false);
  readonly failed = signal(false);
  readonly columns = ['Company', 'Administrator', 'Status', 'Actions'];
  readonly companies = signal<Company[]>([]);
  readonly busy = signal(false);
  readonly loading = signal(false);
  readonly message = signal('');
  readonly invitationLink = signal('');
  readonly invitationExpiry = signal('');
  profile = emptyCompanyProfile();
  slug = '';
  admin_email = '';
  admin_name = '';
  search = '';
  page = 1;
  total = 0;
  private readonly options = { headers: { 'X-HRMS-Request': '1' } };
  constructor() {
    this.load();
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.http
      .get<{ items: Company[]; total: number }>('/api/v1/platform/companies', {
        params: { page: this.page, limit: 20, search: this.search },
      })
      .subscribe({
        next: (result) => {
          this.companies.set(result.items);
          this.total = result.total;
          this.loading.set(false);
        },
        error: (error) => this.fail(error),
      });
  }
  changePage(event: PageEvent) {
    this.page = event.pageIndex + 1;
    this.load();
  }
  startCreate() {
    this.creating.set(true);
    this.message.set('');
    this.failed.set(false);
  }
  create() {
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.message.set('');
    this.invitationLink.set('');
    this.http
      .post<{ invitation: Invitation }>(
        '/api/v1/platform/companies',
        {
          ...this.profile,
          slug: this.slug,
          admin_email: this.admin_email,
          admin_name: this.admin_name,
        },
        this.options,
      )
      .subscribe({
        next: (result) => {
          this.showInvitation(result.invitation);
          this.creating.set(false);
          this.profile = emptyCompanyProfile();
          this.slug = '';
          this.admin_email = '';
          this.admin_name = '';
          this.page = 1;
          this.load();
          this.message.set(
            'Company created. Share the activation link securely with its administrator.',
          );
        },
        error: (error) => this.fail(error),
      });
  }
  reissue(company: Company) {
    if (this.busy()) return;
    this.dialog
      .open(ConfirmDialog, {
        width: '440px',
        data: {
          title: 'Replace activation link?',
          message: `Create a new link for ${company.admin_email}. The previous link will stop working. This is available only while activation is pending.`,
          action: 'Replace link',
        },
      })
      .afterClosed()
      .subscribe((confirmed) => {
        if (confirmed) this.sendInvitation(company);
      });
  }
  private sendInvitation(company: Company) {
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.invitationLink.set('');
    this.message.set('');
    this.http
      .post<{ invitation: Invitation }>(
        `/api/v1/platform/companies/${company.id}/admin-invitation`,
        {},
        this.options,
      )
      .subscribe({
        next: (result) => {
          this.showInvitation(result.invitation);
          this.message.set('Replacement link created. The previous link is invalid.');
        },
        error: (error) => this.fail(error),
      });
  }
  private showInvitation(invitation: Invitation) {
    // URL fragments are not sent to the server or included in referrer headers.
    this.invitationLink.set(`${window.location.origin}/activate#${invitation.token}`);
    this.invitationExpiry.set(new Date(invitation.expires_at).toLocaleString());
    this.busy.set(false);
  }
  private fail(error: HttpErrorResponse) {
    this.failed.set(true);
    this.busy.set(false);
    this.loading.set(false);
    const m = error.error?.message;
    this.message.set(
      Array.isArray(m)
        ? m.join('. ')
        : m || 'Unable to complete the request. Please sign in again if your session expired.',
    );
  }
}

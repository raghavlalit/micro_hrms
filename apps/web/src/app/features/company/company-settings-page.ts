import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AppIcon } from '../../shared/ui/app-icon';
import { Component, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import {
  CompanyProfile,
  CompanyProfileFields,
  emptyCompanyProfile,
} from '../../shared/company-profile-fields';
@Component({
  imports: [...MATERIAL_FORM_IMPORTS, AppIcon, CompanyProfileFields, FormsModule],
  styleUrl: '../../shared/workspace.scss',
  templateUrl: './company-settings-page.html',
})
export class CompanySettingsPage {
  private readonly http = inject(HttpClient);
  readonly message = signal('');
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly failed = signal(false);
  profile = emptyCompanyProfile();
  slug = '';
  constructor() {
    this.http.get<CompanyProfile & { slug: string }>('/api/v1/company/settings').subscribe({
      next: (result) => {
        this.slug = result.slug;
        this.profile = {
          name: result.name,
          timezone: result.timezone,
          currency: result.currency,
          date_format: result.date_format,
          contact_email: result.contact_email,
          contact_phone: result.contact_phone ?? '',
          address: { ...emptyCompanyProfile().address, ...result.address },
        };
        this.ready.set(true);
      },
      error: (error) => this.fail(error),
    });
  }
  save() {
    if (this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.message.set('');
    this.http
      .put('/api/v1/company/settings', this.profile, { headers: { 'X-HRMS-Request': '1' } })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.message.set('Company settings saved.');
        },
        error: (error) => this.fail(error),
      });
  }
  private fail(error: HttpErrorResponse) {
    this.failed.set(true);
    this.busy.set(false);
    const m = error.error?.message;
    this.message.set(
      Array.isArray(m) ? m.join('. ') : m || 'Unable to load or save company settings.',
    );
  }
}

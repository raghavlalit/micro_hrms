import { Component, input } from '@angular/core';
import { FormsModule, ControlContainer, NgForm } from '@angular/forms';
import { MATERIAL_FORM_IMPORTS } from './ui/material';
export interface CompanyProfile {
  name: string;
  timezone: string;
  currency: string;
  date_format: string;
  contact_email: string;
  contact_phone: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postal_code: string;
    country: string;
  };
}
export const emptyCompanyProfile = (): CompanyProfile => ({
  name: '',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  date_format: 'dd/MM/yyyy',
  contact_email: '',
  contact_phone: '',
  address: { line1: '', line2: '', city: '', state: '', postal_code: '', country: '' },
});
@Component({
  selector: 'app-company-profile-fields',
  imports: [FormsModule, ...MATERIAL_FORM_IMPORTS],
  // Register these reusable fields with the enclosing form so its validation includes them.
  viewProviders: [{ provide: ControlContainer, useExisting: NgForm }],
  styleUrl: './workspace.scss',
  templateUrl: './company-profile-fields.html',
  styles: [
    `
      :host {
        background: transparent;
        min-height: 0;
      }
    `,
  ],
})
export class CompanyProfileFields {
  readonly profile = input.required<CompanyProfile>();
}

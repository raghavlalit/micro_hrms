import { Component, input } from '@angular/core';
import { ControlContainer, FormsModule, NgForm } from '@angular/forms';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { EmployeeContact } from './employee.models';
@Component({
  selector: 'app-employee-contact-fields',
  imports: [FormsModule, ...MATERIAL_FORM_IMPORTS],
  // Include these reusable controls in the parent's validation state.
  viewProviders: [{ provide: ControlContainer, useExisting: NgForm }],
  templateUrl: './employee-contact-fields.html',
})
export class EmployeeContactFields {
  readonly model = input.required<EmployeeContact>();
  readonly addressFields = [
    { key: 'line1', label: 'Address line 1', max: 200 },
    { key: 'line2', label: 'Address line 2', max: 200 },
    { key: 'city', label: 'City', max: 100 },
    { key: 'state', label: 'State', max: 100 },
    { key: 'postal_code', label: 'Postal code', max: 20 },
    { key: 'country', label: 'Country', max: 100 },
  ] as const;
}

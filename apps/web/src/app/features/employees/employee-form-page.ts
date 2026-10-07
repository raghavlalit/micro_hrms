import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { forkJoin, of } from 'rxjs';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AppIcon } from '../../shared/ui/app-icon';
import { EmployeeApi, employeeError } from './employee-api.service';
import { EmployeeLookups, editableProfile, emptyEmployee } from './employee.models';
import { EmployeeContactFields } from './employee-contact-fields';
@Component({
  imports: [FormsModule, RouterLink, AppIcon, EmployeeContactFields, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './employee-form-page.html',
  styleUrl: './employees.scss',
})
export class EmployeeFormPage {
  private readonly api = inject(EmployeeApi);
  private readonly router = inject(Router);
  readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? undefined;
  readonly ready = signal(false);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly lookups = signal<EmployeeLookups>({
    departments: [],
    designations: [],
    locations: [],
    managers: [],
    work_schedules: [],
  });
  readonly assignments = [
    { key: 'department_id', label: 'Department', source: 'departments' },
    { key: 'designation_id', label: 'Designation', source: 'designations' },
    { key: 'location_id', label: 'Work location', source: 'locations' },
    { key: 'manager_id', label: 'Reporting manager', source: 'managers' },
    { key: 'work_schedule_id', label: 'Work schedule', source: 'work_schedules' },
  ] as const;
  profile = emptyEmployee();
  linkedAccount = false;
  constructor() {
    forkJoin({
      lookups: this.api.lookups(),
      detail: this.id ? this.api.detail(this.id) : of(null),
    }).subscribe({
      next: ({ lookups, detail }) => {
        if (detail) {
          this.profile = editableProfile(detail.employee);
          this.linkedAccount = !!detail.employee.user_id;
          // Keep an existing historical assignment visible even after the master is archived.
          for (const field of this.assignments) {
            const current = this.profile[field.key];
            if (current && !lookups[field.source].some((option) => option.id === current))
              lookups[field.source].push({
                id: current,
                name:
                  String(
                    detail.employee[
                      field.key.replace('_id', '_name') as keyof typeof detail.employee
                    ] || 'Current assignment',
                  ) + ' (current)',
              });
          }
        }
        this.lookups.set(lookups);
        this.ready.set(true);
      },
      error: (error) => this.message.set(employeeError(error)),
    });
  }
  save() {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    this.api.save(this.profile, this.id).subscribe({
      next: (employee) => void this.router.navigate(['/employees', employee.id]),
      error: (error) => {
        this.busy.set(false);
        this.message.set(employeeError(error));
      },
    });
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MATERIAL_FORM_IMPORTS } from '../../shared/ui/material';
import { AppIcon } from '../../shared/ui/app-icon';
import { SessionService } from '../../core/auth/session.service';
import { EmployeeApi, employeeError } from './employee-api.service';
import { Employee, EmployeeLookups, employeeStatuses } from './employee.models';
@Component({
  imports: [FormsModule, RouterLink, MatPaginatorModule, AppIcon, ...MATERIAL_FORM_IMPORTS],
  templateUrl: './employee-list-page.html',
  styleUrl: './employees.scss',
})
export class EmployeeListPage {
  private readonly api = inject(EmployeeApi);
  readonly session = inject(SessionService);
  readonly rows = signal<Employee[]>([]);
  readonly loading = signal(false);
  readonly message = signal('');
  readonly lookups = signal<EmployeeLookups | null>(null);
  readonly statuses = employeeStatuses;
  readonly filters = [
    { key: 'department_id', label: 'Department', source: 'departments' },
    { key: 'designation_id', label: 'Designation', source: 'designations' },
    { key: 'location_id', label: 'Location', source: 'locations' },
    { key: 'manager_id', label: 'Reporting manager', source: 'managers' },
  ] as const;
  search = '';
  status = '';
  assignments: Record<string, string> = {};
  page = 0;
  pageSize = 20;
  total = 0;
  canManage() {
    return !!this.session.user()?.permissions.includes('employees.manage');
  }
  constructor() {
    this.load();
    if (this.canManage())
      this.api
        .lookups()
        .subscribe({
          next: (data) => this.lookups.set(data),
          error: (error) => this.message.set(employeeError(error)),
        });
  }
  load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.message.set('');
    const params: Record<string, string | number> = {
      page: this.page + 1,
      limit: this.pageSize,
      search: this.search,
    };
    if (this.status) params['status'] = this.status;
    for (const [key, value] of Object.entries(this.assignments)) if (value) params[key] = value;
    this.api.list(params).subscribe({
      next: (result) => {
        this.rows.set(result.items);
        this.total = result.total;
        this.loading.set(false);
      },
      error: (error) => {
        this.message.set(employeeError(error));
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
  clear() {
    this.search = '';
    this.status = '';
    this.assignments = {};
    this.apply();
  }
  paginate(event: PageEvent) {
    this.page = event.pageIndex;
    this.pageSize = event.pageSize;
    this.load();
  }
}

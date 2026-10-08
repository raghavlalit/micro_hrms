import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { SessionService } from '../core/auth/session.service';
import { AppIcon } from '../shared/ui/app-icon';

@Component({
  imports: [
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    MatSidenavModule,
    MatButtonModule,
    MatMenuModule,
    AppIcon,
  ],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.scss',
})
export class AdminLayout {
  readonly session = inject(SessionService);
  readonly router = inject(Router);
  readonly mobile = toSignal(
    inject(BreakpointObserver)
      .observe('(max-width: 960px)')
      .pipe(map((result) => result.matches)),
    { initialValue: false },
  );
  readonly mobileOpen = signal(false);
  readonly collapsed = signal(false);
  readonly signingOut = signal(false);
  readonly error = signal('');
  readonly sections = [
    {
      label: 'WORKSPACE',
      items: [
        { label: 'Overview', path: '/company/overview', icon: 'grid', permission: '' },
        { label: 'Payroll', path: '/payroll', icon: 'wallet', permission: 'payroll.manage' },
        {
          label: 'My payslips',
          path: '/payroll/payslips',
          icon: 'document',
          permission: 'payslips.read.self',
        },
        {
          label: 'Leave',
          path: '/leave',
          icon: 'calendar',
          permission: 'leave.self|leave.manage|leave.approve.team',
        },
        {
          label: 'Attendance',
          path: '/attendance',
          icon: 'calendar',
          permission: 'attendance.self|attendance.manage|attendance.approve.team',
        },
        {
          label: 'Employees',
          path: '/employees',
          icon: 'team',
          permission: 'employees.manage|employees.read.team',
        },
        {
          label: 'My profile',
          path: '/employees/me',
          icon: 'team',
          permission: 'employees.read.self',
        },
        {
          label: 'Company profile',
          path: '/company/settings',
          icon: 'company',
          permission: 'company.manage',
        },
      ],
    },
    {
      label: 'ORGANIZATION',
      items: [
        {
          label: 'Departments',
          path: '/organization/departments',
          icon: 'team',
          permission: 'company.manage',
        },
        {
          label: 'Designations',
          path: '/organization/designations',
          icon: 'team',
          permission: 'company.manage',
        },
        {
          label: 'Office locations',
          path: '/organization/locations',
          icon: 'company',
          permission: 'company.manage',
        },
        {
          label: 'Work schedules',
          path: '/organization/work-schedules',
          icon: 'calendar',
          permission: 'company.manage',
        },
        { label: 'Holidays', path: '/holidays', icon: 'calendar', permission: '' },
      ],
    },
    {
      label: 'POLICIES & SETTINGS',
      items: [
        {
          label: 'Leave types',
          path: '/leave/types',
          icon: 'calendar',
          permission: 'leave.manage',
        },
        {
          label: 'Leave policies',
          path: '/leave/policies',
          icon: 'document',
          permission: 'leave.manage',
        },
        {
          label: 'Salary components',
          path: '/payroll/components',
          icon: 'wallet',
          permission: 'payroll.manage',
        },
        {
          label: 'Document categories',
          path: '/documents/categories',
          icon: 'document',
          permission: 'documents.manage',
        },
      ],
    },
    {
      label: 'ADMINISTRATION',
      items: [
        {
          label: 'Users & access',
          path: '/administration/users',
          icon: 'team',
          permission: 'roles.manage',
        },
        {
          label: 'Roles & permissions',
          path: '/administration/roles',
          icon: 'document',
          permission: 'roles.manage',
        },
      ],
    },
  ];
  can(permission: string) {
    return (
      !permission ||
      permission.split('|').some((value) => this.session.user()?.permissions.includes(value))
    );
  }
  visibleSections() {
    return this.sections
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => this.can(item.permission)),
      }))
      .filter((section) => section.items.length);
  }
  title() {
    if (this.router.url.startsWith('/payroll/payslips')) return 'Payslips';
    if (
      this.router.url.startsWith('/payroll/runs') ||
      this.router.url.startsWith('/payroll/salaries')
    )
      return 'Payroll';
    if (
      this.router.url.startsWith('/leave/requests') ||
      this.router.url.startsWith('/leave/calendar')
    )
      return 'Leave';
    if (this.router.url.startsWith('/attendance')) return 'Attendance';
    if (this.router.url.startsWith('/employees'))
      return this.router.url === '/employees/me' ? 'My profile' : 'Employees';
    if (this.router.url.startsWith('/platform')) return 'Companies';
    return (
      this.sections
        .flatMap((section) => section.items)
        .find((item) => this.router.url.split('?')[0] === item.path)?.label ?? 'Workspace'
    );
  }
  isActive(path: string) {
    const current = this.router.url.split('?')[0];
    if (path === '/payroll')
      return (
        current === path || current.startsWith('/payroll/runs/') || current === '/payroll/salaries'
      );
    if (path === '/payroll/payslips') return current === path || current.startsWith(path + '/');
    if (path === '/leave')
      return ['/leave', '/leave/requests', '/leave/calendar'].includes(current);
    if (path === '/employees')
      return current === path || (current.startsWith('/employees/') && current !== '/employees/me');
    return current === path;
  }
  toggle() {
    this.mobile()
      ? this.mobileOpen.update((value) => !value)
      : this.collapsed.update((value) => !value);
  }
  logout() {
    if (this.signingOut()) return;
    this.signingOut.set(true);
    this.session.logout().subscribe({
      next: () => this.router.navigateByUrl('/login'),
      error: () => {
        this.signingOut.set(false);
        this.error.set('Unable to sign out. Please try again.');
      },
    });
  }
}

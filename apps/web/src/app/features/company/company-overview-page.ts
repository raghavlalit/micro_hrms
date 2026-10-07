import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { SessionService } from '../../core/auth/session.service';
import { AppIcon } from '../../shared/ui/app-icon';

@Component({
  imports: [RouterLink, MatButtonModule, AppIcon],
  templateUrl: './company-overview-page.html',
  styleUrl: './company-overview-page.scss',
})
export class CompanyOverviewPage {
  readonly session = inject(SessionService);
  readonly cards = [
    {
      title: 'Attendance',
      description: 'Check in, review monthly records and manage attendance corrections.',
      path: '/attendance',
      icon: 'calendar',
      permission: 'attendance.self|attendance.manage|attendance.approve.team',
    },
    {
      title: 'Holiday calendar',
      description: 'Upcoming company holidays and the dates applicable to your location.',
      path: '/holidays',
      icon: 'calendar',
      permission: '',
    },
    {
      title: 'Employees',
      description: 'Employee profiles, reporting relationships and lifecycle management.',
      path: '/employees',
      icon: 'team',
      permission: 'employees.manage|employees.read.team',
    },
    {
      title: 'My profile',
      description: 'View your employment information and keep your contact details current.',
      path: '/employees/me',
      icon: 'team',
      permission: 'employees.read.self',
    },
    {
      title: 'Company profile',
      description: 'Company details, contact information and regional preferences.',
      path: '/company/settings',
      icon: 'company',
      permission: 'company.manage',
    },
    {
      title: 'Organization',
      description: 'Departments, designations and the places your team works.',
      path: '/organization/departments',
      icon: 'team',
      permission: 'company.manage',
    },
    {
      title: 'Work schedules',
      description: 'Working days, office hours and attendance thresholds.',
      path: '/organization/work-schedules',
      icon: 'calendar',
      permission: 'company.manage',
    },
    {
      title: 'Leave settings',
      description: 'Leave categories and policies tailored to your company.',
      path: '/leave/types',
      icon: 'calendar',
      permission: 'leave.manage',
    },
    {
      title: 'Salary components',
      description: 'Organize earnings and deductions for future payroll setup.',
      path: '/payroll/components',
      icon: 'wallet',
      permission: 'payroll.manage',
    },
    {
      title: 'Document categories',
      description: 'Set up the categories for your company documents.',
      path: '/documents/categories',
      icon: 'document',
      permission: 'documents.manage',
    },
  ];
  can(permission: string) {
    return (
      !permission ||
      permission.split('|').some((value) => this.session.user()?.permissions.includes(value))
    );
  }
  hasSettings() {
    return this.cards.some((card) => this.can(card.permission));
  }
}

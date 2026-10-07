import { Routes } from '@angular/router';
import { sessionGuard } from './core/auth/session.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'activate',
    loadComponent: () => import('./features/auth/activate-page').then((m) => m.ActivatePage),
  },
  {
    path: '',
    loadComponent: () => import('./layouts/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: 'attendance',
        loadChildren: () => import('./features/attendance/attendance.routes').then((m) => m.routes),
      },
      {
        path: 'administration',
        loadChildren: () => import('./features/users/users.routes').then((m) => m.routes),
      },
      {
        path: 'employees',
        loadChildren: () => import('./features/employees/employees.routes').then((m) => m.routes),
      },
      {
        path: 'company/overview',
        canActivate: [sessionGuard],
        data: { scope: 'tenant' },
        loadComponent: () =>
          import('./features/company/company-overview-page').then((m) => m.CompanyOverviewPage),
      },
      {
        path: 'platform/companies',
        canActivate: [sessionGuard],
        data: { scope: 'platform' },
        loadComponent: () =>
          import('./features/platform/companies-page').then((m) => m.CompaniesPage),
      },
      {
        path: 'company/settings',
        canActivate: [sessionGuard],
        data: { scope: 'tenant', permission: 'company.manage' },
        loadComponent: () =>
          import('./features/company/company-settings-page').then((m) => m.CompanySettingsPage),
      },
      {
        path: 'organization',
        loadChildren: () =>
          import('./features/organization/organization.routes').then((m) => m.routes),
      },
      {
        path: 'leave',
        loadChildren: () => import('./features/leave/leave.routes').then((m) => m.routes),
      },
      {
        path: 'payroll',
        loadChildren: () => import('./features/payroll/payroll.routes').then((m) => m.routes),
      },
      {
        path: 'documents',
        loadChildren: () => import('./features/documents/documents.routes').then((m) => m.routes),
      },
      {
        path: 'holidays',
        loadChildren: () => import('./features/holidays/holidays.routes').then((m) => m.routes),
      },
    ],
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/auth-page').then((m) => m.AuthPage),
  },
  { path: '**', redirectTo: 'login' },
];

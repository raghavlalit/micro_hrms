import { Routes } from '@angular/router';
import { sessionGuard } from './core/auth/session.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password-page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password-page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'activate',
    loadComponent: () => import('./features/auth/activate-page').then((m) => m.ActivatePage),
  },
  {
    path: '',
    loadComponent: () => import('./layouts/admin-layout').then((m) => m.AdminLayout),
    children: [
      {
        path: 'audit-logs',
        canActivate: [sessionGuard],
        data: { scope: 'tenant', permission: 'company.manage' },
        loadComponent: () => import('./features/audit/audit-page').then((m) => m.AuditPage),
      },
      {
        path: 'notifications',
        canActivate: [sessionGuard],
        data: { scope: 'tenant' },
        loadComponent: () =>
          import('./features/notifications/notification-page').then((m) => m.NotificationPage),
      },
      {
        path: 'notifications/deliveries',
        canActivate: [sessionGuard],
        data: { scope: 'tenant', permission: 'company.manage' },
        loadComponent: () =>
          import('./features/notifications/delivery-page').then((m) => m.DeliveryPage),
      },
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
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'reports',
        canActivate: [sessionGuard],
        data: { scope: 'tenant' },
        loadComponent: () => import('./features/reports/report-page').then((m) => m.ReportPage),
      },
      {
        path: 'reports/exports', canActivate: [sessionGuard], data: { scope: 'tenant' },
        loadComponent: () => import('./features/reports/report-exports-page').then(m => m.ReportExportsPage),
      },
      {
        path: 'company/setup',
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

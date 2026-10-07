import { Routes } from '@angular/router';
import { sessionGuard } from '../../core/auth/session.guard';
export const routes: Routes = [
  {
    path: '',
    canActivate: [sessionGuard],
    data: { scope: 'tenant' },
    loadComponent: () => import('./employee-list-page').then((m) => m.EmployeeListPage),
  },
  {
    path: 'new',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'employees.manage' },
    loadComponent: () => import('./employee-form-page').then((m) => m.EmployeeFormPage),
  },
  {
    path: 'me',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'employees.read.self' },
    loadComponent: () => import('./employee-detail-page').then((m) => m.EmployeeDetailPage),
  },
  {
    path: ':id/edit',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'employees.manage' },
    loadComponent: () => import('./employee-form-page').then((m) => m.EmployeeFormPage),
  },
  {
    path: ':id',
    canActivate: [sessionGuard],
    data: { scope: 'tenant' },
    loadComponent: () => import('./employee-detail-page').then((m) => m.EmployeeDetailPage),
  },
];

import { CanActivateFn, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { sessionGuard } from '../../core/auth/session.guard';
import { MasterConfig, nameAndCode } from '../../shared/master-editor/master-config';
const master: MasterConfig = {
  title: 'Salary components',
  endpoint: 'payroll/components',
  description:
    'Define earnings and deduction labels. This does not configure salary amounts, statutory rates or payroll calculations.',
  fields: [
    ...nameAndCode,
    {
      key: 'kind',
      label: 'Type',
      type: 'select',
      required: true,
      options: [
        { value: 'earning', label: 'Earning' },
        { value: 'deduction', label: 'Deduction' },
      ],
    },
    { key: 'is_active', label: 'Active', type: 'checkbox' },
  ],
  defaults: { name: '', code: '', kind: 'earning', is_active: true },
};
const payslipGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(SessionService)
    .load()
    .pipe(
      map(({ user }) =>
        user.kind === 'tenant' &&
        !user.mustChangePassword &&
        user.permissions.some((p) => ['payroll.manage', 'payslips.read.self'].includes(p))
          ? true
          : router.createUrlTree(['/login']),
      ),
      catchError(() => of(router.createUrlTree(['/login']))),
    );
};
export const routes: Routes = [
  {
    path: '',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'payroll.manage' },
    loadComponent: () => import('./payroll-page').then((m) => m.PayrollPage),
  },
  {
    path: 'salaries',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'payroll.manage' },
    loadComponent: () => import('./salary-page').then((m) => m.SalaryPage),
  },
  {
    path: 'runs/:id',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'payroll.manage' },
    loadComponent: () => import('./payroll-run-page').then((m) => m.PayrollRunPage),
  },
  {
    path: 'payslips',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'payslips.read.self' },
    loadComponent: () => import('./payslip-page').then((m) => m.PayslipPage),
  },
  {
    path: 'payslips/:id',
    canActivate: [payslipGuard],
    loadComponent: () => import('./payslip-page').then((m) => m.PayslipPage),
  },
  {
    path: 'components',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'payroll.manage', master },
    loadComponent: () =>
      import('../../shared/master-editor/master-editor').then((m) => m.MasterEditor),
  },
];

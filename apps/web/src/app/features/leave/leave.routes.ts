import { CanActivateFn, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { sessionGuard } from '../../core/auth/session.guard';
import { MasterConfig, nameAndCode } from '../../shared/master-editor/master-config';
const records: Record<string, MasterConfig> = {
  types: {
    title: 'Leave types',
    endpoint: 'leave/types',
    description: 'Leave categories do not credit balances. Configure policies separately.',
    fields: [
      ...nameAndCode,
      { key: 'description', label: 'Description', type: 'text' },
      { key: 'is_active', label: 'Active', type: 'checkbox' },
    ],
    defaults: { name: '', code: '', description: '', is_active: true },
  },
  policies: {
    title: 'Leave policies',
    endpoint: 'leave/policies',
    description:
      'Define company rules, then assign an annual entitlement from Leave management. Existing request calculations retain their original rules.',
    fields: [
      { key: 'name', label: 'Policy name', type: 'text', required: true },
      {
        key: 'leave_type_id',
        label: 'Leave type',
        type: 'select',
        required: true,
        lookup: 'leave/types',
      },
      {
        key: 'annual_entitlement',
        label: 'Annual entitlement (days)',
        type: 'number',
        required: true,
        min: 0,
        max: 366,
        step: '0.01',
      },
      { key: 'is_paid', label: 'Paid leave', type: 'checkbox' },
      { key: 'balance_controlled', label: 'Require sufficient balance', type: 'checkbox' },
      { key: 'carry_forward_enabled', label: 'Allow carry-forward', type: 'checkbox' },
      { key: 'exclude_non_working_days', label: 'Exclude non-working days', type: 'checkbox' },
      { key: 'effective_from', label: 'Effective from', type: 'date', required: true },
      { key: 'effective_to', label: 'Effective to (optional)', type: 'date' },
    ],
    defaults: {
      name: '',
      leave_type_id: '',
      annual_entitlement: 0,
      is_paid: true,
      balance_controlled: true,
      carry_forward_enabled: false,
      exclude_non_working_days: true,
      effective_from: '',
      effective_to: null,
    },
  },
};
const leaveGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(SessionService)
    .load()
    .pipe(
      map(({ user }) =>
        user.kind === 'tenant' &&
        !user.mustChangePassword &&
        user.permissions.some((p) =>
          ['leave.self', 'leave.manage', 'leave.approve.team'].includes(p),
        )
          ? true
          : router.createUrlTree(['/login']),
      ),
      catchError(() => of(router.createUrlTree(['/login']))),
    );
};
export const routes: Routes = [
  {
    path: '',
    canActivate: [leaveGuard],
    loadComponent: () => import('./leave-page').then((m) => m.LeavePage),
  },
  {
    path: 'requests',
    canActivate: [leaveGuard],
    loadComponent: () => import('./leave-requests-page').then((m) => m.LeaveRequestsPage),
  },
  {
    path: 'calendar',
    canActivate: [leaveGuard],
    loadComponent: () => import('./leave-calendar-page').then((m) => m.LeaveCalendarPage),
  },
  ...Object.entries(records).map(([path, master]) => ({
    path,
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'leave.manage', master },
    loadComponent: () =>
      import('../../shared/master-editor/master-editor').then((m) => m.MasterEditor),
  })),
];

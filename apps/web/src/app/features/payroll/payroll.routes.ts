import { Routes } from '@angular/router';
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
export const routes: Routes = [
  {
    path: 'components',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'payroll.manage', master },
    loadComponent: () =>
      import('../../shared/master-editor/master-editor').then((m) => m.MasterEditor),
  },
];

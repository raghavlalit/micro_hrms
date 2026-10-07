import { Routes } from '@angular/router';
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
      'Define your company rules. Policies do not automatically assign employees or credit balances; those workflows come with the leave module.',
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
export const routes: Routes = Object.entries(records).map(([path, master]) => ({
  path,
  canActivate: [sessionGuard],
  data: { scope: 'tenant', permission: 'leave.manage', master },
  loadComponent: () =>
    import('../../shared/master-editor/master-editor').then((m) => m.MasterEditor),
}));

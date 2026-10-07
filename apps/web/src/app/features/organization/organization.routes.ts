import { Routes } from '@angular/router';
import { sessionGuard } from '../../core/auth/session.guard';
import { MasterConfig, nameAndCode } from '../../shared/master-editor/master-config';
const description = 'These records belong to your company. Changes do not affect other companies.';
const records: Record<string, MasterConfig> = {
  departments: {
    title: 'Departments',
    endpoint: 'organization/departments',
    description,
    fields: nameAndCode,
    defaults: { name: '', code: '' },
  },
  designations: {
    title: 'Designations',
    endpoint: 'organization/designations',
    description,
    fields: nameAndCode,
    defaults: { name: '', code: '' },
  },
  locations: {
    title: 'Office locations',
    endpoint: 'organization/locations',
    description,
    fields: [
      ...nameAndCode,
      { key: 'address.line1', label: 'Address line 1', type: 'text' },
      { key: 'address.line2', label: 'Address line 2', type: 'text' },
      { key: 'address.city', label: 'City', type: 'text' },
      { key: 'address.state', label: 'State', type: 'text' },
      { key: 'address.postal_code', label: 'Postal code', type: 'text' },
      { key: 'address.country', label: 'Country', type: 'text' },
    ],
    defaults: {
      name: '',
      code: '',
      address: { line1: '', line2: '', city: '', state: '', postal_code: '', country: '' },
    },
  },
  'work-schedules': {
    title: 'Work schedules',
    endpoint: 'organization/work-schedules',
    description: 'Choose your working days and attendance thresholds in the company timezone.',
    fields: [
      { key: 'name', label: 'Schedule name', type: 'text', required: true },
      { key: 'location_id', label: 'Location', type: 'select', lookup: 'organization/locations' },
      { key: 'working_days', label: 'Working days', type: 'weekdays' },
      { key: 'start_time', label: 'Start time', type: 'time', required: true },
      { key: 'end_time', label: 'End time', type: 'time', required: true },
      {
        key: 'late_grace_minutes',
        label: 'Late grace (minutes)',
        type: 'number',
        required: true,
        min: 0,
        max: 1440,
      },
      {
        key: 'half_day_minutes',
        label: 'Half-day minimum (minutes)',
        type: 'number',
        required: true,
        min: 1,
        max: 1440,
      },
      {
        key: 'full_day_minutes',
        label: 'Full-day minimum (minutes)',
        type: 'number',
        required: true,
        min: 1,
        max: 1440,
      },
    ],
    defaults: {
      name: '',
      location_id: null,
      working_days: [1, 2, 3, 4, 5],
      start_time: '09:00',
      end_time: '18:00',
      late_grace_minutes: 15,
      half_day_minutes: 240,
      full_day_minutes: 480,
    },
  },
};
export const routes: Routes = Object.entries(records).map(([path, master]) => ({
  path,
  canActivate: [sessionGuard],
  data: { scope: 'tenant', permission: 'company.manage', master },
  loadComponent: () =>
    import('../../shared/master-editor/master-editor').then((m) => m.MasterEditor),
}));

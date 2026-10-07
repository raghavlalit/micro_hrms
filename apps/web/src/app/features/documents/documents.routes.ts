import { Routes } from '@angular/router';
import { sessionGuard } from '../../core/auth/session.guard';
import { MasterConfig, nameAndCode } from '../../shared/master-editor/master-config';
const master: MasterConfig = {
  title: 'Document categories',
  endpoint: 'documents/categories',
  description: 'Organize the document categories used by your company.',
  fields: nameAndCode,
  defaults: { name: '', code: '' },
};
export const routes: Routes = [
  {
    path: 'categories',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'documents.manage', master },
    loadComponent: () =>
      import('../../shared/master-editor/master-editor').then((m) => m.MasterEditor),
  },
];

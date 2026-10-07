import { Routes } from '@angular/router';
import { sessionGuard } from '../../core/auth/session.guard';
export const routes: Routes = [
  {
    path: 'users',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'roles.manage' },
    loadComponent: () => import('./user-list-page').then((m) => m.UserListPage),
  },
  {
    path: 'roles',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'roles.manage' },
    loadComponent: () => import('./roles-page').then((m) => m.RolesPage),
  },
];

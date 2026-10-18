import { CanActivateFn, Router, Routes } from '@angular/router';
import { inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { sessionGuard } from '../../core/auth/session.guard';
import { MasterConfig, nameAndCode } from '../../shared/master-editor/master-config';
const master: MasterConfig = {
  title: 'Document categories',
  endpoint: 'documents/categories',
  description: 'Organize the document categories used by your company.',
  fields: nameAndCode,
  defaults: { name: '', code: '' },
};
const documentGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(SessionService)
    .load()
    .pipe(
      map(({ user }) =>
        user.kind === 'tenant' &&
        !user.mustChangePassword &&
        user.permissions.some((permission) =>
          ['documents.manage', 'documents.read.self', 'documents.read.team'].includes(permission),
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
    canActivate: [documentGuard],
    loadComponent: () => import('./document-page').then((m) => m.DocumentPage),
  },
  {
    path: 'categories',
    canActivate: [sessionGuard],
    data: { scope: 'tenant', permission: 'documents.manage', master },
    loadComponent: () =>
      import('../../shared/master-editor/master-editor').then((m) => m.MasterEditor),
  },
  {
    path: ':id',
    canActivate: [documentGuard],
    loadComponent: () => import('./document-detail-page').then((m) => m.DocumentDetailPage),
  },
];

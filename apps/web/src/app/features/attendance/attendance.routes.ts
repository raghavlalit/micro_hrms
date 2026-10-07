import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { SessionService } from '../../core/auth/session.service';
import { catchError, map, of } from 'rxjs';
const attendanceGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(SessionService)
    .load()
    .pipe(
      map(({ user }) =>
        user.kind === 'tenant' &&
        !user.mustChangePassword &&
        user.permissions.some((p) =>
          ['attendance.self', 'attendance.manage', 'attendance.approve.team'].includes(p),
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
    canActivate: [attendanceGuard],
    loadComponent: () => import('./attendance-page').then((m) => m.AttendancePage),
  },
  {
    path: 'requests',
    canActivate: [attendanceGuard],
    loadComponent: () => import('./attendance-requests-page').then((m) => m.AttendanceRequestsPage),
  },
];

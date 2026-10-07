import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { SessionService } from './session.service';
export const sessionGuard: CanActivateFn = (route) => {
  const router = inject(Router);
  return inject(SessionService)
    .load()
    .pipe(
      map(({ user }) => {
        if (user.mustChangePassword || user.kind !== route.data['scope'])
          return router.createUrlTree(['/login']);
        const permission = route.data['permission'] as string | undefined;
        return !permission || user.permissions.includes(permission)
          ? true
          : router.createUrlTree(['/login']);
      }),
      catchError(() => of(router.createUrlTree(['/login']))),
    );
};

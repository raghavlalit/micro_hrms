import { Component, effect, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { catchError, of, switchMap, timer } from 'rxjs';
import { SessionService } from '../../core/auth/session.service';
import { AppIcon } from '../../shared/ui/app-icon';
import { NotificationApi } from './notification-api.service';
@Component({
  selector: 'app-notification-bell',
  imports: [RouterLink, MatButtonModule, MatBadgeModule, AppIcon],
  template: `<a
    mat-icon-button
    routerLink="/notifications"
    [attr.aria-label]="
      api.unread() === null ? 'Notifications' : 'Notifications, ' + api.unread() + ' unread'
    "
    [matBadge]="(api.unread() ?? 0) > 99 ? '99+' : api.unread()"
    [matBadgeHidden]="!api.unread()"
    matBadgeSize="small"
    ><app-icon name="bell"
  /></a>`,
})
export class NotificationBell {
  readonly api = inject(NotificationApi);
  readonly session = inject(SessionService);
  constructor() {
    effect((onCleanup) => {
      const user = this.session.user();
      this.api.unread.set(null);
      if (user?.kind !== 'tenant' || user.mustChangePassword) return;
      const subscription = timer(0, 30000)
        .pipe(switchMap(() => this.api.count().pipe(catchError(() => of(null)))))
        .subscribe((result) => this.api.unread.set(result?.unread ?? null));
      onCleanup(() => subscription.unsubscribe());
    });
  }
}

import { Routes } from '@angular/router';
import { sessionGuard } from '../../core/auth/session.guard';
export const routes: Routes = [
  {
    path: '',
    canActivate: [sessionGuard],
    data: { scope: 'tenant' },
    loadComponent: () => import('./holiday-calendar-page').then((m) => m.HolidayCalendarPage),
  },
];

import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { routes } from './app.routes';
import { CALENDAR_DATE_PROVIDERS } from './shared/ui/calendar-date-adapter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(),
    // Dialog/calendar overlays are created from the application environment injector.
    // Feature imports alone do not make the date adapter available there.
    ...CALENDAR_DATE_PROVIDERS,
  ],
};

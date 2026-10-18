import { NgModule } from '@angular/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { CALENDAR_DATE_PROVIDERS } from './calendar-date-adapter';

@NgModule({
  imports: [MatDatepickerModule],
  exports: [MatDatepickerModule],
  providers: CALENDAR_DATE_PROVIDERS,
})
export class CalendarModule {}

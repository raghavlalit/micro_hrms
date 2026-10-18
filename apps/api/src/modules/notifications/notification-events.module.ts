import { Module } from '@nestjs/common';
import { NotificationConfig } from './notification-config';
import { NotificationSecret } from './notification-secret';
import { NotificationRecipients } from './notification-recipients';
import { NotificationEvents } from './notification-events.service';
@Module({
  providers: [
    NotificationConfig,
    NotificationSecret,
    NotificationRecipients,
    NotificationEvents,
  ],
  exports: [
    NotificationConfig,
    NotificationSecret,
    NotificationRecipients,
    NotificationEvents,
  ],
})
export class NotificationEventsModule {}

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { NotificationEventsModule } from './notification-events.module';
import { NotificationDelivery } from './notification-delivery.service';
import { EmailProvider, SmtpEmailProvider } from './email-provider';
import { NotificationWorker } from './notification-worker';
@Module({
  imports: [DatabaseModule, TenantContextModule, NotificationEventsModule],
  providers: [
    NotificationDelivery,
    { provide: EmailProvider, useClass: SmtpEmailProvider },
    NotificationWorker,
  ],
})
export class NotificationWorkerModule {}

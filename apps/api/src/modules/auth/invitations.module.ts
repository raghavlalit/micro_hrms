import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { NotificationEventsModule } from '../notifications/notification-events.module';
@Module({
  imports: [NotificationEventsModule],
  providers: [InvitationsService],
  exports: [InvitationsService],
})
export class InvitationsModule {}

import { Module } from '@nestjs/common';
import { InvitationsService } from './invitations.service';
@Module({ providers: [InvitationsService], exports: [InvitationsService] })
export class InvitationsModule {}

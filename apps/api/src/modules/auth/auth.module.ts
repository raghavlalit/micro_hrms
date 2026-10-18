import { Module } from '@nestjs/common';
import { PasswordRecoveryService } from './password-recovery.service';
import { PasswordRecoveryController } from './password-recovery.controller';
import { NotificationEventsModule } from '../notifications/notification-events.module';
import { APP_GUARD } from '@nestjs/core';
import { DatabaseModule } from '../../database/database.module';
import { AuthService } from './auth.service';
import { AuthGuard } from './auth.guard';
import { AuthController } from './auth.controller';
import { AuthRepository } from './auth.repository';
import { TenantsModule } from '../tenants/tenants.module';
import { InvitationsModule } from './invitations.module';
import { EmployeeAccountModule } from '../employees/employee-account.module';
@Module({
  imports: [
    DatabaseModule,
    NotificationEventsModule,
    TenantsModule,
    InvitationsModule,
    EmployeeAccountModule,
  ],
  providers: [
    AuthService,
    AuthRepository,
    PasswordRecoveryService,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  controllers: [AuthController, PasswordRecoveryController],
})
export class AuthModule {}

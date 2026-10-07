import { Module } from '@nestjs/common';
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
    TenantsModule,
    InvitationsModule,
    EmployeeAccountModule,
  ],
  providers: [
    AuthService,
    AuthRepository,
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
  controllers: [AuthController],
})
export class AuthModule {}

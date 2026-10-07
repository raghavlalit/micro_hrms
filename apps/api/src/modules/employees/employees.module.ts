import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { InvitationsModule } from '../auth/invitations.module';
import { EmployeeAccountModule } from './employee-account.module';
import { EmployeeService } from './employee.service';
import { EmployeeRepository } from './employee-repository';
import { EmployeePrivateService } from './employee-private.service';
import { EmployeesController } from './employees.controller';
@Module({
  imports: [
    TenantsModule,
    UsersModule,
    InvitationsModule,
    EmployeeAccountModule,
  ],
  providers: [EmployeeService, EmployeeRepository, EmployeePrivateService],
  controllers: [EmployeesController],
})
export class EmployeesModule {}

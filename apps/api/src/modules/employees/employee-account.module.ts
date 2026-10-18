import { Module } from '@nestjs/common';
import { EmployeeAccountService } from './employee-account.service';
import { AdminEmployeeService } from './admin-employee.service';
// A small dependency-free bridge used by both authentication and employee workflows.
@Module({
  providers: [EmployeeAccountService, AdminEmployeeService],
  exports: [EmployeeAccountService, AdminEmployeeService],
})
export class EmployeeAccountModule {}

import { Module } from '@nestjs/common';
import { EmployeeAccountService } from './employee-account.service';
// A small dependency-free bridge used by both authentication and employee workflows.
@Module({
  providers: [EmployeeAccountService],
  exports: [EmployeeAccountService],
})
export class EmployeeAccountModule {}

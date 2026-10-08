import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { PayrollSettingsController } from './payroll-settings.controller';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { EmployeePayrollModule } from '../employees/employee-payroll.service';
import { LeavePayrollModule } from '../leave/leave-payroll.service';
import { AttendancePayrollModule } from '../attendance/attendance-payroll.service';
import { PayrollContext } from './payroll-context.service';
import { SalaryService } from './salary.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollRunService } from './payroll-run.service';
import { PayrollController, PayslipController } from './payroll.controller';
import { PayslipService } from './payslip.service';
import { PayslipStorage } from './payslip-storage.service';
@Module({
  imports: [
    TenantsModule,
    TenantContextModule,
    EmployeePayrollModule,
    LeavePayrollModule,
    AttendancePayrollModule,
  ],
  controllers: [
    PayrollSettingsController,
    PayrollController,
    PayslipController,
  ],
  providers: [
    PayrollContext,
    SalaryService,
    PayrollCalculationService,
    PayrollRunService,
    PayslipService,
    PayslipStorage,
  ],
})
export class PayrollModule {}

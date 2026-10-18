import { Module } from '@nestjs/common';
import { BackgroundJobsModule } from '../background-jobs/background-jobs.module';
import { PayslipGeneration } from './payslip-generation.service';
import { NotificationEventsModule } from '../notifications/notification-events.module';
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
    BackgroundJobsModule,
    NotificationEventsModule,
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
    PayslipGeneration,
    PayrollContext,
    SalaryService,
    PayrollCalculationService,
    PayrollRunService,
    PayslipService,
    PayslipStorage,
  ],
  exports: [PayslipService, PayslipGeneration],
})
export class PayrollModule {}

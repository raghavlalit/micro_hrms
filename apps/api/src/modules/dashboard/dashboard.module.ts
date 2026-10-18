import { Module } from '@nestjs/common';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { ReportsModule } from '../reports/reports.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { LeaveModule } from '../leave/leave.module';
import { PayrollModule } from '../payroll/payroll.module';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
@Module({
  imports: [
    TenantContextModule,
    ReportsModule,
    AttendanceModule,
    HolidaysModule,
    LeaveModule,
    PayrollModule,
  ],
  providers: [DashboardService],
  controllers: [DashboardController],
})
export class DashboardModule {}

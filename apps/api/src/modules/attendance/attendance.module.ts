import { Module } from '@nestjs/common';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceClock, AttendanceService } from './attendance.service';
import { AttendancePolicy } from './attendance-policy.service';
import { AttendanceRepository } from './attendance-repository';
import { AttendanceRegularizationService } from './attendance-regularization.service';
import { LeaveAttendanceModule } from '../leave/leave-attendance.service';
@Module({
  imports: [TenantContextModule, HolidaysModule, LeaveAttendanceModule],
  exports: [AttendancePolicy],
  controllers: [AttendanceController],
  providers: [
    AttendanceClock,
    AttendanceService,
    AttendancePolicy,
    AttendanceRepository,
    AttendanceRegularizationService,
  ],
})
export class AttendanceModule {}

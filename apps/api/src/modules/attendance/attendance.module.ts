import { Module } from '@nestjs/common';
import { NotificationEventsModule } from '../notifications/notification-events.module';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { AttendanceController } from './attendance.controller';
import { AttendanceClock, AttendanceService } from './attendance.service';
import { AttendancePolicy } from './attendance-policy.service';
import { AttendanceRepository } from './attendance-repository';
import { AttendanceRegularizationService } from './attendance-regularization.service';
import { LeaveAttendanceModule } from '../leave/leave-attendance.service';
@Module({
  imports: [
    TenantContextModule,
    HolidaysModule,
    LeaveAttendanceModule,
    NotificationEventsModule,
  ],
  exports: [AttendancePolicy, AttendanceService, AttendanceClock],
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

import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { LeaveSettingsController } from './leave-settings.controller';
import { AttendanceModule } from '../attendance/attendance.module';
import { HolidaysModule } from '../holidays/holidays.module';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { LeaveAttendanceModule } from './leave-attendance.service';
import { LeaveAccess } from './leave-access.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveRequestService } from './leave-request.service';
import { LeaveQueryService } from './leave-query.service';
import { LeaveController } from './leave.controller';
import { LeaveSettingsService } from './leave-settings.service';
@Module({ imports: [TenantsModule,TenantContextModule,AttendanceModule,HolidaysModule,LeaveAttendanceModule], controllers: [LeaveSettingsController,LeaveController],providers:[LeaveAccess,LeaveBalanceService,LeaveRequestService,LeaveQueryService,LeaveSettingsService] })
export class LeaveModule {}

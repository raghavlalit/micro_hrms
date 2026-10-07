import { Module } from '@nestjs/common';
import { createObserveModule } from '@nestjs/observe';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/database.module';
import { apiEnvPath } from './database/database.options';
import { AuthModule } from './modules/auth/auth.module';
import { PlatformModule } from './modules/platform/platform.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { LeaveModule } from './modules/leave/leave.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { HolidaysModule } from './modules/holidays/holidays.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { AttendanceModule } from './modules/attendance/attendance.module';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    // Distributed tracing, auto-correlated logs, request/job metrics, error
    // telemetry, alarms, and more — out of the box. Sign up at https://observe.nestjs.com
    ...(process.env.OBSERVE_APP_KEY && process.env.OBSERVE_APP_SECRET
      ? [
          ObserveModule.forRoot({
            appKey: process.env.OBSERVE_APP_KEY,
            appSecret: process.env.OBSERVE_APP_SECRET,
            serviceId: 'api',
          }),
        ]
      : []),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: apiEnvPath,
    }),
    DatabaseModule,
    AuthModule,
    PlatformModule,
    OrganizationModule,
    LeaveModule,
    PayrollModule,
    DocumentsModule,
    HolidaysModule,
    EmployeesModule,
    AttendanceModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

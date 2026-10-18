import { Module } from '@nestjs/common';
import { BackgroundJobsModule } from '../background-jobs/background-jobs.module';
import { ReportExports } from './report-export.service';
import { ReportExportStorage } from './report-export-storage.service';
import { ReportExportController } from './report-export.controller';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { AttendanceModule } from '../attendance/attendance.module';
import { ReportAccess } from './report-access.service';
import { ReportReadModel } from './report-read-model';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';
@Module({
  imports: [TenantContextModule, AttendanceModule, BackgroundJobsModule],
  providers: [
    ReportAccess,
    ReportReadModel,
    ReportsService,
    ReportExports,
    ReportExportStorage,
  ],
  controllers: [ReportsController, ReportExportController],
  exports: [ReportAccess, ReportReadModel, ReportExports],
})
export class ReportsModule {}

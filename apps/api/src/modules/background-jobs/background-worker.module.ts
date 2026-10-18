import { Module } from '@nestjs/common';
import { LeaveModule } from '../leave/leave.module';
import { DatabaseModule } from '../../database/database.module';
import { PayrollModule } from '../payroll/payroll.module';
import { ReportsModule } from '../reports/reports.module';
import { BackgroundJobsModule } from './background-jobs.module';
import { BackgroundProcessor } from './background-processor.service';
import { BackgroundWorker } from './background-worker';
@Module({
  imports: [
    DatabaseModule,
    BackgroundJobsModule,
    PayrollModule,
    ReportsModule,
    LeaveModule,
  ],
  providers: [BackgroundProcessor, BackgroundWorker],
})
export class BackgroundWorkerModule {}

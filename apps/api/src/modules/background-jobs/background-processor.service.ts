import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  BadRequestException,
} from '@nestjs/common';
import { BackgroundJobs } from './background-jobs.service';
import { PayslipGeneration } from '../payroll/payslip-generation.service';
import { ReportExports } from '../reports/report-export.service';
import { LeaveAssignmentJobs } from '../leave/leave-assignment-jobs.service';
@Injectable()
export class BackgroundProcessor {
  constructor(
    readonly jobs: BackgroundJobs,
    readonly payslips: PayslipGeneration,
    readonly reports: ReportExports,
    readonly leave: LeaveAssignmentJobs,
  ) {}
  async process(tenantId: string, id: string) {
    await this.reports.expire(tenantId, id);
    const job = await this.jobs.claim(tenantId, id);
    if (!job) return;
    let heartbeat: Promise<unknown> | undefined;
    const timer = setInterval(() => {
      if (!heartbeat)
        heartbeat = this.jobs
          .progress(job)
          .catch(() => undefined)
          .finally(() => {
            heartbeat = undefined;
          });
    }, 20000);
    timer.unref();
    try {
      if (job.kind === 'payslips') await this.payslips.generate(job);
      else if (job.kind === 'leave_assignment') await this.leave.generate(job);
      else await this.reports.generate(job);
    } catch (error) {
      const code =
        error instanceof ForbiddenException
          ? 'ACCESS_CHANGED'
          : error instanceof PayloadTooLargeException
            ? 'EXPORT_TOO_LARGE'
            : error instanceof NotFoundException
              ? 'RESOURCE_UNAVAILABLE'
              : error instanceof ConflictException ||
                  error instanceof BadRequestException
                ? 'INPUT_CHANGED'
                : 'GENERATION_FAILED';
      // Job failures are durable and sanitized. Never put exception messages,
      // report rows, employee names or salary details into Redis or logs.
      await this.jobs.fail(job, code, code !== 'GENERATION_FAILED');
    } finally {
      clearInterval(timer);
      await heartbeat;
    }
  }
}

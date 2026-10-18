import {
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Principal } from '../auth/auth.service';
import { BackgroundIdentity } from '../auth/background-identity.service';
import {
  BackgroundJob,
  JobRecord,
} from '../background-jobs/background-job.schemas';
import {
  BackgroundJobs,
  publicJob,
  requestHash,
} from '../background-jobs/background-jobs.service';
import { NotificationEvents } from '../notifications/notification-events.service';
import { PayrollContext } from './payroll-context.service';
import { PayrollRunService } from './payroll-run.service';
import { PayrollTransitionDto } from './payroll.dto';
import { PayrollLine, PayrollRun, Payslip } from './payroll.schemas';
import { PayslipStorage } from './payslip-storage.service';
import { payslipPdf } from './payslip-pdf';
import type { PayrollSnapshot } from './payroll-calculation.service';

@Injectable()
export class PayslipGeneration {
  constructor(
    readonly context: PayrollContext,
    readonly runs: PayrollRunService,
    readonly storage: PayslipStorage,
    readonly notifications: NotificationEvents,
    readonly jobs: BackgroundJobs,
    readonly identities: BackgroundIdentity,
  ) {}

  enqueue(actor: Principal, id: string, dto: PayrollTransitionDto) {
    return this.context.write(actor, async (manager) => {
      const run = await this.context.run(manager, actor.tenantId!, id);
      if (run.status !== 'locked')
        throw new ConflictException('Lock payroll before publishing payslips');
      this.runs.current(run, dto.revision);
      if (Number(run.calculation_version) !== dto.calculation_version)
        throw new ConflictException('Payroll version changed');
      if (run.published_at)
        return { id, published: true, replayed: true, job: null };
      const payload = {
        version: dto.calculation_version,
        revision: dto.revision,
      };
      const queued = await this.jobs.enqueue(
        manager,
        actor,
        'payslips',
        `${id}/${dto.calculation_version}`,
        requestHash(payload),
        payload,
        id,
      );
      let job = queued.job;
      if (job.status === 'failed')
        job = await this.jobs.retry(manager, job, actor.id);
      if (queued.created || queued.job.status === 'failed')
        await this.context.audit(manager, actor, id, 'payslips_queued', {
          job_id: job.id,
          reason: dto.reason,
        });
      return { id, published: false, job: publicJob(job) };
    });
  }
  status(actor: Principal, id: string) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      await this.context.run(manager, actor.tenantId!, id);
      const row = await manager
        .getRepository(BackgroundJob)
        .findOne({
          where: {
            tenant_id: actor.tenantId,
            kind: 'payslips',
            resource_id: id,
          },
          order: { created_at: 'DESC' },
        });
      return { job: row ? publicJob(row as unknown as JobRecord) : null };
    });
  }
  async generate(job: JobRecord) {
    const prepared = await this.context.tenants.withTenant(
      job.tenant_id,
      async (manager) => {
        const actor = await this.identities.resolve(
          manager,
          job.tenant_id,
          job.requested_by,
        );
        if (!actor.permissions.includes('payroll.manage'))
          throw new ForbiddenException('Payroll access changed');
        const run = await this.context.run(
          manager,
          job.tenant_id,
          job.resource_id!,
        );
        if (
          run.status !== 'locked' ||
          Number(run.calculation_version) !== job.payload.version
        )
          throw new ConflictException('Payroll version changed');
        const items = await this.runs.items(manager, job.tenant_id, run);
        if (!items.length)
          throw new ConflictException('No calculated employees to publish');
        return { run, items };
      },
    );
    await this.jobs.progress(job, 0, prepared.items.length);
    // PDF/file work is outside HTTP and outside the company write lock. Nothing
    // becomes downloadable until the final publication transaction commits.
    let done = 0;
    for (const item of prepared.items) {
      const lines = await this.context.tenants.withTenant(
        job.tenant_id,
        (manager) =>
          manager.getRepository(PayrollLine).find({
            where: {
              tenant_id: job.tenant_id,
              payroll_employee_id: String(item.id),
            },
            order: { kind: 'DESC', component_code: 'ASC', id: 'ASC' },
          }),
      );
      const run = prepared.run;
      const bytes = await payslipPdf({
        id: String(item.id),
        period_start: String(run.period_start),
        period_end: String(run.period_end),
        pay_date: String(run.pay_date),
        locked_at: new Date(run.locked_at as Date),
        gross: String(item.gross),
        deductions: String(item.deductions),
        net: String(item.net),
        snapshot: item.input_snapshot as PayrollSnapshot,
        lines: lines.map((line) => ({
          component_name: String(line.component_name),
          kind: String(line.kind),
          amount: String(line.amount),
        })),
      });
      await this.storage.save(`${job.tenant_id}/${String(item.id)}.pdf`, bytes);
      await this.jobs.progress(job, ++done, prepared.items.length);
    }
    const actor: Principal = {
      kind: 'tenant',
      tenantId: job.tenant_id,
      id: job.requested_by,
      email: '',
      permissions: [],
      mustChangePassword: false,
    };
    await this.context.write(actor, async (manager) => {
      await this.jobs.assertLease(manager, job);
      const current = await this.identities.resolve(
        manager,
        job.tenant_id,
        job.requested_by,
      );
      if (!current.permissions.includes('payroll.manage'))
        throw new ForbiddenException('Payroll access changed');
      const run = await this.context.run(
        manager,
        job.tenant_id,
        job.resource_id!,
      );
      if (
        run.status !== 'locked' ||
        Number(run.calculation_version) !== job.payload.version
      )
        throw new ConflictException('Payroll version changed');
      if (!run.published_at) {
        for (const item of prepared.items) {
          await manager
            .getRepository(Payslip)
            .insert({
              id: String(item.id),
              tenant_id: job.tenant_id,
              payroll_employee_id: item.id,
              object_key: `${job.tenant_id}/${String(item.id)}.pdf`,
              status: 'published',
              published_at: new Date(),
            });
          await this.notifications.payslip(
            manager,
            job.tenant_id,
            String(item.employee_id),
            String(item.id),
          );
        }
        await manager
          .getRepository(PayrollRun)
          .update(
            { tenant_id: job.tenant_id, id: String(run.id) },
            { published_at: () => 'now()' },
          );
        await this.context.audit(
          manager,
          current,
          String(run.id),
          'payslips_published',
          { count: prepared.items.length, job_id: job.id },
        );
      }
      await this.jobs.complete(
        manager,
        job,
        { count: prepared.items.length },
        prepared.items.length,
      );
    });
  }
}

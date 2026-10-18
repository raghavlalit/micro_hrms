import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
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
import { Employee } from '../employees/employee.schemas';
import { LeaveAssignmentDirectory } from './leave-assignment-directory.service';
import { LeaveAssignmentPreviewDto } from './leave-assignment.dto';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveBalance, LeavePolicy } from './leave.schemas';

export interface Outcome {
  id: string;
  name: string;
  employee_code: string;
  status: 'assignable' | 'assigned' | 'skipped' | 'rejected';
}
interface AssignmentPayload {
  policy_name: string;
  credited: number;
  input: LeaveAssignmentPreviewDto;
  policy_hash: string;
  employees: Outcome[];
}
@Injectable()
export class LeaveAssignmentJobs {
  constructor(
    readonly directory: LeaveAssignmentDirectory,
    readonly balances: LeaveBalanceService,
    readonly jobs: BackgroundJobs,
    readonly identity: BackgroundIdentity,
  ) {}
  async policy(manager: EntityManager, actor: Principal, id: string) {
    const policy = await manager
      .getRepository(LeavePolicy)
      .findOneBy({ id, tenant_id: actor.tenantId });
    if (!policy || policy.archived_at)
      throw new NotFoundException('Active policy not found');
    return policy;
  }
  async classify(
    manager: EntityManager,
    actor: Principal,
    input: LeaveAssignmentPreviewDto,
    employees: Outcome[],
  ) {
    const policy = await this.policy(manager, actor, input.policy_id);
    const { query, expected } = this.directory.query(manager, actor, {
      year: input.year,
      policy_id: input.policy_id,
      page: 1,
      limit: 100,
    });
    const eligible = new Set(
      (
        await query
          .andWhere('employee.id IN (:...ids)', {
            ids: employees.map((e) => e.id),
          })
          .andWhere(`(${expected})>0`)
          .select('employee.id', 'id')
          .getRawMany()
      ).map((row) => row.id),
    );
    const existing = new Set(
      (
        await manager.getRepository(LeaveBalance).find({
          select: { employee_id: true },
          where: {
            tenant_id: actor.tenantId,
            employee_id: In(employees.map((e) => e.id)),
            leave_type_id: String(policy.leave_type_id),
            period_start: `${input.year}-01-01`,
          },
        })
      ).map((row) => String(row.employee_id)),
    );
    return employees.map(
      (employee) =>
        ({
          ...employee,
          status: existing.has(employee.id)
            ? 'skipped'
            : eligible.has(employee.id)
              ? 'assignable'
              : 'rejected',
        }) as Outcome,
    );
  }
  preview(actor: Principal, input: LeaveAssignmentPreviewDto) {
    this.directory.requireManage(actor);
    if (
      !input.filters ||
      input.filters.year !== input.year ||
      input.carry_forward !== 0
    )
      throw new BadRequestException(
        'Use matching years and zero carry-forward for bulk assignments',
      );
    if (
      input.all_matching
        ? !!input.employee_ids?.length
        : !input.employee_ids?.length
    )
      throw new BadRequestException(
        'Choose either explicit employees or all matching employees',
      );
    return this.jobs.write(actor, async (manager) => {
      const existing = await manager.getRepository(BackgroundJob).findOneBy({
        tenant_id: actor.tenantId,
        kind: 'leave_assignment',
        request_key: input.operation_id,
      });
      if (existing) {
        const job = await this.owned(manager, actor, String(existing.id));
        if (
          job.request_hash !==
          requestHash(input as unknown as Record<string, unknown>)
        )
          throw new ConflictException(
            'Use a new operation ID for changed input',
          );
        return this.view(job, 1);
      }
      const policy = await this.policy(manager, actor, input.policy_id);
      if (
        !policy.balance_controlled &&
        (input.credited ?? Number(policy.annual_entitlement)) !== 0
      )
        throw new BadRequestException('Uncontrolled leave uses zero credit');
      let employees: Outcome[];
      if (input.all_matching) {
        const { query } = this.directory.matching(
          manager,
          actor,
          input.filters,
        );
        employees = await query
          .select([
            'employee.id AS id',
            "concat(employee.first_name, ' ', employee.last_name) AS name",
            'employee.employee_code AS employee_code',
          ])
          .orderBy('employee.id')
          .limit(10001)
          .getRawMany();
      } else {
        const rows = await manager
          .getRepository(Employee)
          .findBy({ tenant_id: actor.tenantId, id: In(input.employee_ids!) });
        if (rows.length !== input.employee_ids!.length)
          throw new NotFoundException('Employee selection unavailable');
        employees = rows.map((row) => ({
          id: String(row.id),
          name: `${row.first_name} ${row.last_name}`,
          employee_code: String(row.employee_code),
          status: 'assignable',
        }));
      }
      if (!employees.length)
        throw new BadRequestException('No matching employees');
      if (employees.length > 10000)
        throw new PayloadTooLargeException('Select at most 10,000 employees');
      employees.sort((a, b) => a.id.localeCompare(b.id));
      const preview = await this.classify(manager, actor, input, employees);
      const { job } = await this.jobs.enqueue(
        manager,
        actor,
        'leave_assignment',
        input.operation_id,
        requestHash(input as unknown as Record<string, unknown>),
        {
          input,
          policy_name: String(policy.name),
          credited: input.credited ?? Number(policy.annual_entitlement),
          policy_hash: requestHash(policy),
          employees: preview,
        },
      );
      // Draft and frozen selection commit together; the worker only sees confirmed jobs.
      await manager.getRepository(BackgroundJob).update(
        { id: job.id, tenant_id: actor.tenantId },
        {
          status: 'draft',
          total_units: employees.length,
          expires_at: () => "now() + interval '30 minutes'",
        },
      );
      return this.view(
        await this.jobs.get(manager, actor.tenantId!, job.id),
        1,
      );
    });
  }
  async owned(manager: EntityManager, actor: Principal, id: string) {
    const job = await this.jobs.get(manager, actor.tenantId!, id);
    if (job.kind !== 'leave_assignment' || job.requested_by !== actor.id)
      throw new NotFoundException('Assignment job not found');
    return job;
  }
  view(job: JobRecord, page: number) {
    const payload = job.payload as unknown as AssignmentPayload;
    const outcomes = (job.result.outcomes ?? []) as Outcome[];
    const rows = job.status === 'draft' ? payload.employees : outcomes;
    const counts = { assignable: 0, assigned: 0, skipped: 0, rejected: 0 };
    for (const row of rows) counts[row.status]++;
    return {
      ...publicJob(job),
      status:
        job.status === 'draft' &&
        new Date(job.expires_at!).getTime() <= Date.now()
          ? 'expired'
          : job.status,
      year: payload.input.year,
      policy_name: payload.policy_name,
      credited: payload.credited,
      reason: payload.input.reason,
      counts,
      items: rows.slice((page - 1) * 50, page * 50),
      total: rows.length,
    };
  }
  list(actor: Principal) {
    this.directory.requireManage(actor);
    return this.jobs.tenants.withTenant(actor.tenantId!, async (manager) => {
      const rows = await manager.getRepository(BackgroundJob).find({
        where: {
          tenant_id: actor.tenantId,
          requested_by: actor.id,
          kind: 'leave_assignment',
        },
        order: { created_at: 'DESC' },
        take: 20,
      });
      return rows.map((row) => this.view(row as unknown as JobRecord, 1));
    });
  }
  get(actor: Principal, id: string, page: number) {
    this.directory.requireManage(actor);
    return this.jobs.tenants.withTenant(actor.tenantId!, async (manager) =>
      this.view(await this.owned(manager, actor, id), page),
    );
  }
  confirm(actor: Principal, id: string, retry = false) {
    this.directory.requireManage(actor);
    return this.jobs.write(actor, async (manager) => {
      const job = await this.owned(manager, actor, id);
      const payload = job.payload as unknown as AssignmentPayload;
      if (
        requestHash(
          await this.policy(manager, actor, payload.input.policy_id),
        ) !== payload.policy_hash
      )
        throw new ConflictException(
          'Policy changed; create a fresh preview. Existing assignments are preserved.',
        );
      if (retry) {
        await this.jobs.retry(manager, job, actor.id);
        // Preserve committed outcomes on retry, so a crash never credits twice.
        await manager.getRepository(BackgroundJob).update(
          { id, tenant_id: actor.tenantId },
          {
            result: job.result,
            total_units: payload.employees.length,
            completed_units: ((job.result.outcomes ?? []) as Outcome[]).length,
          },
        );
      } else if (job.status === 'draft') {
        if (new Date(job.expires_at!).getTime() <= Date.now())
          throw new ConflictException(
            'Preview expired; create a fresh preview',
          );
        if (
          (await manager.getRepository(BackgroundJob).countBy({
            tenant_id: actor.tenantId,
            requested_by: actor.id,
            status: In(['pending', 'running']),
          })) >= 3
        )
          throw new ConflictException(
            'Wait for an existing background job to finish',
          );
        await manager
          .getRepository(BackgroundJob)
          .update(
            { id, tenant_id: actor.tenantId },
            { status: 'pending', expires_at: null },
          );
        await this.directory.access.audit(
          manager,
          actor,
          id,
          'bulk_assignment_confirmed',
          {
            year: payload.input.year,
            policy_id: payload.input.policy_id,
            employees: payload.employees.length,
          },
        );
      } else if (!['pending', 'running', 'completed'].includes(job.status))
        throw new ConflictException(
          'Create a fresh preview or retry a failed job',
        );
      return this.view(await this.jobs.get(manager, actor.tenantId!, id), 1);
    });
  }
  async generate(job: JobRecord) {
    const payload = job.payload as unknown as AssignmentPayload;
    for (const employee of payload.employees) {
      await this.jobs.tenants.withTenant(job.tenant_id, async (manager) => {
        await this.directory.access.workforce.lockTenant(
          manager,
          job.tenant_id,
        );
        await this.jobs.assertLease(manager, job);
        const actor = await this.identity.resolve(
          manager,
          job.tenant_id,
          job.requested_by,
        );
        this.directory.requireManage(actor);
        if (
          requestHash(
            await this.policy(manager, actor, payload.input.policy_id),
          ) !== payload.policy_hash
        )
          throw new ConflictException('Policy changed');
        const current = await this.jobs.get(manager, job.tenant_id, job.id);
        const outcomes = (current.result.outcomes ?? []) as Outcome[];
        if (outcomes.some((row) => row.id === employee.id)) return;
        // Only employees approved as assignable in the preview can receive credit.
        const outcome =
          employee.status === 'assignable'
            ? (
                await this.classify(manager, actor, payload.input, [employee])
              )[0]
            : { ...employee };
        if (outcome.status === 'assignable') {
          await this.balances.setupInTransaction(
            manager,
            actor,
            employee.id,
            payload.input,
          );
          outcome.status = 'assigned';
        }
        outcomes.push(outcome);
        await manager.getRepository(BackgroundJob).update(
          { id: job.id, tenant_id: job.tenant_id },
          {
            result: { outcomes },
            completed_units: outcomes.length,
            total_units: payload.employees.length,
            available_at: () => "now() + interval '2 minutes'",
          },
        );
      });
    }
    await this.jobs.tenants.withTenant(job.tenant_id, async (manager) => {
      const current = await this.jobs.get(manager, job.tenant_id, job.id);
      await this.jobs.complete(
        manager,
        job,
        current.result,
        payload.employees.length,
      );
    });
  }
}

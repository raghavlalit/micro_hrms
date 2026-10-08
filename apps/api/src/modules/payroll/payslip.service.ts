import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Principal } from '../auth/auth.service';
import { Employee } from '../employees/employee.schemas';
import { PayrollContext } from './payroll-context.service';
import { PayrollRunService } from './payroll-run.service';
import {
  Payslip,
  PayrollEmployee,
  PayrollLine,
  PayrollRun,
} from './payroll.schemas';
import { PayrollListDto, PayrollTransitionDto } from './payroll.dto';
import { PayslipStorage } from './payslip-storage.service';
import { payslipPdf } from './payslip-pdf';
import type { PayrollSnapshot } from './payroll-calculation.service';
@Injectable()
export class PayslipService {
  constructor(
    readonly context: PayrollContext,
    readonly runs: PayrollRunService,
    readonly storage: PayslipStorage,
  ) {}
  publish(actor: Principal, id: string, dto: PayrollTransitionDto) {
    return this.context.write(actor, async (manager) => {
      const run = await this.context.run(manager, actor.tenantId!, id);
      if (run.status !== 'locked')
        throw new ConflictException('Lock payroll before publishing payslips');
      this.runs.current(run, dto.revision);
      if (Number(run.calculation_version) !== dto.calculation_version)
        throw new ConflictException('Payroll version changed');
      if (run.published_at) return { id, published: true, replayed: true };
      const items = await this.runs.items(manager, actor.tenantId!, run);
      if (!items.length)
        throw new ConflictException('No calculated employees to publish');
      for (const item of items) {
        const lines = await manager
          .getRepository(PayrollLine)
          .find({
            where: {
              tenant_id: actor.tenantId,
              payroll_employee_id: String(item.id),
            },
            order: { kind: 'DESC', component_code: 'ASC', id: 'ASC' },
          });
        const file = await payslipPdf({
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
        const key = `${actor.tenantId}/${String(item.id)}.pdf`;
        await this.storage.save(key, file);
        await manager
          .getRepository(Payslip)
          .insert({
            id: String(item.id),
            tenant_id: actor.tenantId,
            payroll_employee_id: item.id,
            object_key: key,
            status: 'published',
            published_at: new Date(),
          });
      }
      await manager
        .getRepository(PayrollRun)
        .update(
          { tenant_id: actor.tenantId, id },
          { published_at: new Date() },
        );
      await this.context.audit(manager, actor, id, 'payslips_published', {
        count: items.length,
        reason: dto.reason,
      });
      return { id, published: true, count: items.length };
    });
  }
  list(actor: Principal, dto: PayrollListDto) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      if (!actor.permissions.includes('payslips.read.self'))
        throw new ForbiddenException('Own payslip access required');
      const query = manager
        .getRepository(Payslip)
        .createQueryBuilder('slip')
        .innerJoin(
          PayrollEmployee.options.name,
          'item',
          'item.id = slip.payroll_employee_id AND item.tenant_id = slip.tenant_id',
        )
        .innerJoin(
          PayrollRun.options.name,
          'run',
          'run.id = item.payroll_run_id AND run.tenant_id = item.tenant_id',
        )
        .innerJoin(
          Employee.options.name,
          'employee',
          'employee.id = item.employee_id AND employee.tenant_id = item.tenant_id',
        )
        .where(
          'slip.tenant_id = :tenantId AND employee.user_id = :userId AND slip.status = :status AND run.status = :locked AND run.published_at IS NOT NULL AND item.calculation_version = run.calculation_version',
          {
            tenantId: actor.tenantId,
            userId: actor.id,
            status: 'published',
            locked: 'locked',
          },
        );
      const total = await query.getCount();
      const items = await query
        .select([
          'slip.id AS id',
          'run.period_start::text AS period_start',
          'run.period_end::text AS period_end',
          'run.pay_date::text AS pay_date',
          'run.currency AS currency',
          'item.gross AS gross',
          'item.deductions AS deductions',
          'item.net AS net',
          'slip.published_at AS published_at',
        ])
        .orderBy('run.period_start', 'DESC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany();
      return { items, total };
    });
  }
  async detail(actor: Principal, id: string) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      const slip = await manager
        .getRepository(Payslip)
        .findOneBy({ tenant_id: actor.tenantId, id, status: 'published' });
      if (!slip) throw new NotFoundException('Payslip not found');
      const item = await manager
        .getRepository(PayrollEmployee)
        .findOneByOrFail({
          tenant_id: actor.tenantId,
          id: String(slip.payroll_employee_id),
        });
      const run = await this.context.run(
        manager,
        actor.tenantId!,
        String(item.payroll_run_id),
      );
      if (
        run.status !== 'locked' ||
        !run.published_at ||
        run.calculation_version !== item.calculation_version
      )
        throw new NotFoundException('Payslip not found');
      if (!actor.permissions.includes('payroll.manage')) {
        const owns =
          actor.permissions.includes('payslips.read.self') &&
          (await manager
            .getRepository(Employee)
            .existsBy({
              tenant_id: actor.tenantId,
              id: String(item.employee_id),
              user_id: actor.id,
            }));
        if (!owns) throw new NotFoundException('Payslip not found');
      }
      const lines = await manager
        .getRepository(PayrollLine)
        .find({
          where: {
            tenant_id: actor.tenantId,
            payroll_employee_id: String(item.id),
          },
          order: { kind: 'DESC', component_code: 'ASC', id: 'ASC' },
        });
      return {
        id,
        period_start: run.period_start,
        period_end: run.period_end,
        pay_date: run.pay_date,
        currency: run.currency,
        gross: item.gross,
        deductions: item.deductions,
        net: item.net,
        published_at: slip.published_at,
        employee: (item.input_snapshot as PayrollSnapshot).employee,
        company_name: (item.input_snapshot as PayrollSnapshot).company_name,
        lines: lines.map((line) => ({
          name: line.component_name,
          kind: line.kind,
          amount: line.amount,
        })),
        file_key: String(slip.object_key),
      };
    });
  }
  async view(actor: Principal, id: string) {
    const { file_key: _, ...data } = await this.detail(actor, id);
    return data;
  }
  async download(actor: Principal, id: string) {
    const data = await this.detail(actor, id);
    return {
      bytes: await this.storage.read(data.file_key),
      filename: `payslip-${String(data.period_start).slice(0, 7)}-${id}.pdf`,
    };
  }
}

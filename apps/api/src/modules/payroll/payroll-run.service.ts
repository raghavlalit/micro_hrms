import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { Tenant } from '../tenants/tenant.schemas';
import { companyToday } from '../holidays/holiday-calendar';
import { PayrollContext } from './payroll-context.service';
import { PayrollCalculationService } from './payroll-calculation.service';
import { PayrollEmployee, PayrollLine, PayrollRun } from './payroll.schemas';
import {
  PayrollAdjustmentDto,
  PayrollAdjustmentEditDto,
  PayrollCalculateDto,
  PayrollListDto,
  PayrollRunDto,
  PayrollSettingsDto,
  PayrollTransitionDto,
} from './payroll.dto';
import { cents, datesInMonth, money } from './payroll-money';
export interface PayrollConfig {
  unpaid_leave_deduction: boolean;
  revision: string;
  input_hash?: string;
  excluded?: unknown[];
  pending_leave?: number;
  pending_corrections?: number;
  method: string;
}
@Injectable()
export class PayrollRunService {
  constructor(
    readonly context: PayrollContext,
    readonly calculation: PayrollCalculationService,
  ) {}
  config(run: Record<string, unknown>) {
    return run.calculation_config as PayrollConfig;
  }
  current(run: Record<string, unknown>, revision: string) {
    if (this.config(run).revision !== revision)
      throw new ConflictException(
        'Payroll changed. Reload and review the current amounts.',
      );
  }
  settings(actor: Principal) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      const tenant = await manager
        .getRepository(Tenant)
        .findOneByOrFail({ id: actor.tenantId });
      return {
        unpaid_leave_deduction:
          (
            tenant.settings as {
              payroll?: { unpaid_leave_deduction?: boolean };
            }
          ).payroll?.unpaid_leave_deduction === true,
        currency: tenant.currency,
        proration: 'calendar_days',
      };
    });
  }
  saveSettings(actor: Principal, dto: PayrollSettingsDto) {
    return this.context.write(actor, async (manager, tenant) => {
      const previous = tenant.settings as object;
      await manager
        .getRepository(Tenant)
        .update(
          { id: actor.tenantId },
          {
            settings: {
              ...previous,
              payroll: { unpaid_leave_deduction: dto.unpaid_leave_deduction },
            },
          },
        );
      await this.context.audit(
        manager,
        actor,
        actor.tenantId!,
        'settings_updated',
        { unpaid_leave_deduction: dto.unpaid_leave_deduction },
      );
      return dto;
    });
  }
  create(actor: Principal, dto: PayrollRunDto) {
    return this.context.write(actor, async (manager, tenant) => {
      const dates = datesInMonth(dto.month),
        from = dates[0],
        to = dates.at(-1)!;
      if (dto.pay_date < from)
        throw new BadRequestException(
          'Pay date cannot precede the payroll month',
        );
      if (
        await manager
          .getRepository(PayrollRun)
          .createQueryBuilder('run')
          .where(
            'run.tenant_id = :tenantId AND run.period_start <= :to AND run.period_end >= :from',
            { tenantId: actor.tenantId, from, to },
          )
          .getExists()
      )
        throw new ConflictException('A payroll run already covers this period');
      const config: PayrollConfig = {
        unpaid_leave_deduction:
          (
            tenant.settings as {
              payroll?: { unpaid_leave_deduction?: boolean };
            }
          ).payroll?.unpaid_leave_deduction === true,
        revision: randomUUID(),
        method: 'monthly_calendar_days_half_up_v1',
      };
      const result = await manager
        .getRepository(PayrollRun)
        .insert({
          tenant_id: actor.tenantId,
          period_start: from,
          period_end: to,
          pay_date: dto.pay_date,
          currency: tenant.currency,
          calculation_config: config,
        });
      const id = String(result.identifiers[0].id);
      await this.context.audit(manager, actor, id, 'run_created', {
        month: dto.month,
        pay_date: dto.pay_date,
        config,
      });
      return { id };
    });
  }
  list(actor: Principal, dto: PayrollListDto) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      const repository = manager.getRepository(PayrollRun);
      const [items, total] = await repository.findAndCount({
        where: { tenant_id: actor.tenantId },
        order: { period_start: 'DESC' },
        skip: (dto.page - 1) * dto.limit,
        take: dto.limit,
      });
      return { items, total };
    });
  }
  async items(
    manager: EntityManager,
    tenantId: string,
    run: Record<string, unknown>,
    version = Number(run.calculation_version),
  ) {
    return manager
      .getRepository(PayrollEmployee)
      .find({
        where: {
          tenant_id: tenantId,
          payroll_run_id: String(run.id),
          calculation_version: version,
        },
        order: { employee_id: 'ASC' },
      });
  }
  detail(actor: Principal, id: string) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      const run = await this.context.run(manager, actor.tenantId!, id);
      const items = await this.items(manager, actor.tenantId!, run);
      const result = [];
      for (const item of items)
        result.push({
          ...item,
          lines: await manager
            .getRepository(PayrollLine)
            .find({
              where: {
                tenant_id: actor.tenantId,
                payroll_employee_id: String(item.id),
              },
              order: { kind: 'DESC', component_code: 'ASC', id: 'ASC' },
            }),
        });
      const versions = await manager
        .getRepository(PayrollEmployee)
        .createQueryBuilder('item')
        .select('DISTINCT item.calculation_version', 'version')
        .where('item.tenant_id = :tenantId AND item.payroll_run_id = :id', {
          tenantId: actor.tenantId,
          id,
        })
        .orderBy('item.calculation_version', 'DESC')
        .getRawMany();
      return {
        run,
        items: result,
        versions: versions.map((row) => Number(row.version)),
      };
    });
  }
  history(actor: Principal, id: string, version: number) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      const run = await this.context.run(manager, actor.tenantId!, id);
      const rows = await this.items(manager, actor.tenantId!, run, version);
      if (!rows.length)
        throw new NotFoundException('Payroll calculation version not found');
      const items = [];
      for (const row of rows)
        items.push({
          ...row,
          lines: await manager
            .getRepository(PayrollLine)
            .findBy({
              tenant_id: actor.tenantId,
              payroll_employee_id: String(row.id),
            }),
        });
      return { version, items };
    });
  }
  calculate(actor: Principal, id: string, dto: PayrollCalculateDto) {
    return this.context.write(actor, async (manager, tenant) => {
      const run = await this.context.run(manager, actor.tenantId!, id);
      this.context.editable(run);
      this.current(run, dto.revision);
      const manual = await manager
        .getRepository(PayrollLine)
        .createQueryBuilder('line')
        .innerJoin(
          PayrollEmployee.options.name,
          'item',
          'item.id = line.payroll_employee_id AND item.tenant_id = line.tenant_id',
        )
        .where(
          'item.tenant_id = :tenantId AND item.payroll_run_id = :id AND item.calculation_version = :version AND line.is_manual = true AND line.amount > 0',
          { tenantId: actor.tenantId, id, version: run.calculation_version },
        )
        .getExists();
      if (manual && !dto.discard_adjustments)
        throw new ConflictException(
          'Recalculation creates a new version without current manual adjustments. Confirm discarding them first.',
        );
      const result = await this.calculation.calculate(
        manager,
        actor.tenantId!,
        run,
        tenant,
      );
      const version = Number(run.calculation_version) + 1;
      let gross = 0n,
        deductions = 0n;
      for (const item of result.items) {
        const { lines, ...values } = item;
        const inserted = await manager
          .getRepository(PayrollEmployee)
          .insert({
            tenant_id: actor.tenantId,
            payroll_run_id: id,
            calculation_version: version,
            ...values,
          });
        const itemId = String(inserted.identifiers[0].id);
        await manager
          .getRepository(PayrollLine)
          .insert(
            lines.map((line) => ({
              tenant_id: actor.tenantId,
              payroll_employee_id: itemId,
              ...line,
            })),
          );
        gross += cents(item.gross);
        deductions += cents(item.deductions);
      }
      await manager
        .getRepository(PayrollRun)
        .update(
          { tenant_id: actor.tenantId, id },
          {
            status: 'calculated',
            calculation_version: version,
            gross_total: money(gross),
            deduction_total: money(deductions),
            net_total: money(gross - deductions),
            reviewed_by: null,
            reviewed_at: null,
            calculation_config: {
              ...this.config(run),
              revision: randomUUID(),
              input_hash: result.input_hash,
              excluded: result.excluded,
              pending_leave: result.pending_leave,
              pending_corrections: result.pending_corrections,
            },
          },
        );
      await this.context.audit(manager, actor, id, 'calculated', {
        version,
        employees: result.items.length,
        discarded_adjustments: manual,
        reason: dto.reason,
        gross: money(gross),
        deductions: money(deductions),
      });
      return { id, calculation_version: version };
    });
  }
  async reconcile(
    manager: EntityManager,
    actor: Principal,
    run: Record<string, unknown>,
    itemId: string,
  ) {
    const lines = await manager
      .getRepository(PayrollLine)
      .findBy({ tenant_id: actor.tenantId, payroll_employee_id: itemId });
    let gross = 0n,
      deductions = 0n;
    for (const line of lines) {
      if (line.kind === 'earning') gross += cents(String(line.amount));
      else deductions += cents(String(line.amount));
    }
    if (deductions > gross)
      throw new ConflictException('Adjustments would make net pay negative');
    await manager
      .getRepository(PayrollEmployee)
      .update(
        { tenant_id: actor.tenantId, id: itemId },
        {
          gross: money(gross),
          deductions: money(deductions),
          net: money(gross - deductions),
        },
      );
    const items = await this.items(manager, actor.tenantId!, run);
    const grossTotal = items.reduce(
        (sum, row) => sum + cents(String(row.gross)),
        0n,
      ),
      deductionTotal = items.reduce(
        (sum, row) => sum + cents(String(row.deductions)),
        0n,
      );
    await manager
      .getRepository(PayrollRun)
      .update(
        { tenant_id: actor.tenantId, id: String(run.id) },
        {
          status: 'calculated',
          gross_total: money(grossTotal),
          deduction_total: money(deductionTotal),
          net_total: money(grossTotal - deductionTotal),
          reviewed_by: null,
          reviewed_at: null,
          calculation_config: { ...this.config(run), revision: randomUUID() },
        },
      );
  }
  adjust(actor: Principal, itemId: string, dto: PayrollAdjustmentDto) {
    return this.context.write(actor, async (manager) => {
      const item = await manager
        .getRepository(PayrollEmployee)
        .findOneBy({ tenant_id: actor.tenantId, id: itemId });
      if (!item) throw new NotFoundException('Payroll employee not found');
      const run = await this.context.run(
        manager,
        actor.tenantId!,
        String(item.payroll_run_id),
      );
      const existing = await manager
        .getRepository(PayrollLine)
        .findOneBy({ tenant_id: actor.tenantId, id: dto.operation_id });
      if (existing) {
        if (
          existing.payroll_employee_id !== itemId ||
          existing.component_name !== dto.name.trim() ||
          existing.kind !== dto.kind ||
          existing.amount !== money(cents(dto.amount)) ||
          existing.adjustment_reason !== dto.reason
        )
          throw new ConflictException(
            'Operation ID was already used for another adjustment',
          );
        return { id: String(existing.id), replayed: true };
      }
      this.context.editable(run, dto.calculation_version);
      this.current(run, dto.revision);
      if (Number(item.calculation_version) !== dto.calculation_version)
        throw new ConflictException(
          'Cannot adjust an older calculation version',
        );
      if (cents(dto.amount) === 0n || !dto.name.trim())
        throw new BadRequestException(
          'Adjustment requires a name and positive amount',
        );
      await manager
        .getRepository(PayrollLine)
        .insert({
          id: dto.operation_id,
          tenant_id: actor.tenantId,
          payroll_employee_id: itemId,
          component_code: 'MANUAL',
          component_name: dto.name.trim(),
          kind: dto.kind,
          amount: money(cents(dto.amount)),
          is_manual: true,
          adjustment_reason: dto.reason,
        });
      await this.reconcile(manager, actor, run, itemId);
      await this.context.audit(
        manager,
        actor,
        String(run.id),
        'adjustment_added',
        {
          item_id: itemId,
          operation_id: dto.operation_id,
          name: dto.name,
          kind: dto.kind,
          amount: dto.amount,
          reason: dto.reason,
        },
      );
      return { id: dto.operation_id };
    });
  }
  editAdjustment(actor: Principal, id: string, dto: PayrollAdjustmentEditDto) {
    return this.context.write(actor, async (manager) => {
      const line = await manager
        .getRepository(PayrollLine)
        .findOneBy({ tenant_id: actor.tenantId, id, is_manual: true });
      if (!line) throw new NotFoundException('Manual adjustment not found');
      const item = await manager
        .getRepository(PayrollEmployee)
        .findOneByOrFail({
          tenant_id: actor.tenantId,
          id: String(line.payroll_employee_id),
        });
      const run = await this.context.run(
        manager,
        actor.tenantId!,
        String(item.payroll_run_id),
      );
      this.context.editable(run, dto.calculation_version);
      this.current(run, dto.revision);
      if (
        Number(item.calculation_version) !== dto.calculation_version ||
        String(line.amount) !== money(cents(dto.expected_amount))
      )
        throw new ConflictException(
          'Adjustment changed. Reload before editing.',
        );
      await manager
        .getRepository(PayrollLine)
        .update(
          { tenant_id: actor.tenantId, id },
          { amount: money(cents(dto.amount)), adjustment_reason: dto.reason },
        );
      await this.reconcile(manager, actor, run, String(item.id));
      await this.context.audit(
        manager,
        actor,
        String(run.id),
        'adjustment_updated',
        {
          line_id: id,
          before: line.amount,
          after: dto.amount,
          reason: dto.reason,
        },
      );
      return { id };
    });
  }
  transition(
    actor: Principal,
    id: string,
    dto: PayrollTransitionDto,
    lock: boolean,
  ) {
    return this.context.write(actor, async (manager, tenant) => {
      const run = await this.context.run(manager, actor.tenantId!, id);
      this.context.editable(run, dto.calculation_version);
      this.current(run, dto.revision);
      if (run.status !== (lock ? 'reviewed' : 'calculated'))
        throw new ConflictException(
          lock
            ? 'Review the calculation before locking'
            : 'Calculate payroll before review',
        );
      const fresh = await this.calculation.calculate(
        manager,
        actor.tenantId!,
        run,
        tenant,
      );
      if (fresh.input_hash !== this.config(run).input_hash)
        throw new ConflictException(
          'Salary, employee or unpaid-leave inputs changed. Recalculate payroll before review or lock.',
        );
      if (lock && (fresh.pending_leave || fresh.pending_corrections))
        throw new ConflictException(
          'Resolve pending leave and attendance corrections before locking this period',
        );
      if (
        lock &&
        String(run.period_end) >= companyToday(String(tenant.timezone))
      )
        throw new ConflictException(
          'Payroll can only be locked after the month has ended',
        );
      await manager
        .getRepository(PayrollRun)
        .update(
          { tenant_id: actor.tenantId, id },
          {
            status: lock ? 'locked' : 'reviewed',
            ...(lock
              ? { locked_by: actor.id, locked_at: new Date() }
              : { reviewed_by: actor.id, reviewed_at: new Date() }),
            calculation_config: { ...this.config(run), revision: randomUUID() },
          },
        );
      await this.context.audit(
        manager,
        actor,
        id,
        lock ? 'locked' : 'reviewed',
        { version: dto.calculation_version, reason: dto.reason },
      );
      return { id, status: lock ? 'locked' : 'reviewed' };
    });
  }
}

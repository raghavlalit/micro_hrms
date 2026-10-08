import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { EmployeePayrollService } from '../employees/employee-payroll.service';
import { PayrollContext } from './payroll-context.service';
import {
  SalaryComponent,
  SalaryStructure,
  SalaryStructureLine,
} from './payroll.schemas';
import {
  PayrollListDto,
  SalaryCreateDto,
  SalaryEditDto,
  SalaryLineDto,
} from './payroll.dto';
import { cents, money, previousDate } from './payroll-money';
import { SalaryComponentDto } from './salary-component.dto';
@Injectable()
export class SalaryService {
  constructor(
    readonly context: PayrollContext,
    readonly employees: EmployeePayrollService,
  ) {}
  people(actor: Principal, dto: PayrollListDto) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = this.employees.query(manager, actor.tenantId!);
      if (dto.search)
        query.andWhere(
          '(employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.employee_code ILIKE :search)',
          { search: `%${dto.search.replace(/[\\%_]/g, '\\$&')}%` },
        );
      const total = await query.getCount();
      const items = await query
        .orderBy('employee.first_name', 'ASC')
        .addOrderBy('employee.id', 'ASC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany();
      return {
        items: items.map((p) => ({
          id: p.id,
          name: `${p.first_name} ${p.last_name}`,
          employee_code: p.employee_code,
          status: p.status,
        })),
        total,
      };
    });
  }
  async lines(manager: EntityManager, tenantId: string, structureId: string) {
    return manager
      .getRepository(SalaryStructureLine)
      .createQueryBuilder('line')
      .innerJoin(
        SalaryComponent.options.name,
        'component',
        'component.id = line.component_id AND component.tenant_id = line.tenant_id',
      )
      .where(
        'line.tenant_id = :tenantId AND line.salary_structure_id = :structureId',
        { tenantId, structureId },
      )
      .select([
        'line.id AS id',
        'line.component_id AS component_id',
        'line.amount AS amount',
        'component.code AS code',
        'component.name AS name',
        'component.kind AS kind',
      ])
      .orderBy('component.code', 'ASC')
      .getRawMany<{
        id: string;
        component_id: string;
        amount: string;
        code: string;
        name: string;
        kind: string;
      }>();
  }
  history(actor: Principal, id: string) {
    return this.context.tenants.withTenant(actor.tenantId!, async (manager) => {
      const employee = await this.employees.one(manager, actor.tenantId!, id);
      if (!employee) throw new NotFoundException('Employee not found');
      const rows = await manager
        .getRepository(SalaryStructure)
        .find({
          where: { tenant_id: actor.tenantId, employee_id: id },
          order: { effective_from: 'DESC' },
        });
      const items = [];
      for (const row of rows)
        items.push({
          ...row,
          lines: await this.lines(manager, actor.tenantId!, String(row.id)),
        });
      return {
        employee: {
          id: employee.id,
          name: `${employee.first_name} ${employee.last_name}`,
          employee_code: employee.employee_code,
        },
        items,
      };
    });
  }
  async validateLines(
    manager: EntityManager,
    tenantId: string,
    lines: SalaryLineDto[],
  ) {
    if (new Set(lines.map((line) => line.component_id)).size !== lines.length)
      throw new BadRequestException('Select each salary component only once');
    let gross = 0n,
      deductions = 0n;
    for (const line of lines) {
      const component = await manager
        .getRepository(SalaryComponent)
        .findOneBy({
          tenant_id: tenantId,
          id: line.component_id,
          is_active: true,
        });
      if (!component)
        throw new BadRequestException(
          'Salary components must be active and belong to this company',
        );
      if (component.kind === 'earning') gross += cents(line.amount);
      else deductions += cents(line.amount);
    }
    if (gross === 0n || deductions > gross)
      throw new BadRequestException(
        'Salary requires positive earnings and deductions cannot exceed earnings',
      );
    money(gross);
    money(deductions);
  }
  create(actor: Principal, id: string, dto: SalaryCreateDto) {
    return this.context.write(actor, async (manager, tenant) => {
      const employee = await this.employees.one(manager, actor.tenantId!, id);
      if (!employee) throw new NotFoundException('Employee not found');
      if (
        dto.effective_from < employee.joining_date ||
        (employee.termination_date &&
          dto.effective_from > employee.termination_date)
      )
        throw new BadRequestException(
          'Salary effective date must be within employment dates',
        );
      const previous = await manager
        .getRepository(SalaryStructure)
        .findOne({
          where: { tenant_id: actor.tenantId, employee_id: id },
          order: { effective_from: 'DESC' },
        });
      if (previous && dto.effective_from <= String(previous.effective_from))
        throw new ConflictException(
          'New salary revisions must start after the latest revision; edit an unlocked revision to correct its amounts',
        );
      await this.context.unlockedDates(
        manager,
        actor.tenantId!,
        dto.effective_from,
      );
      await this.validateLines(manager, actor.tenantId!, dto.lines);
      if (
        previous &&
        (!previous.effective_to ||
          (previous.effective_to as string) >= dto.effective_from)
      )
        await manager
          .getRepository(SalaryStructure)
          .update(
            { tenant_id: actor.tenantId, id: String(previous.id) },
            { effective_to: previousDate(dto.effective_from) },
          );
      const result = await manager
        .getRepository(SalaryStructure)
        .insert({
          tenant_id: actor.tenantId,
          employee_id: id,
          effective_from: dto.effective_from,
          currency: tenant.currency,
          created_by: actor.id,
        });
      const structureId = String(result.identifiers[0].id);
      await manager
        .getRepository(SalaryStructureLine)
        .insert(
          dto.lines.map((line) => ({
            tenant_id: actor.tenantId,
            salary_structure_id: structureId,
            component_id: line.component_id,
            amount: money(cents(line.amount)),
          })),
        );
      await this.context.audit(manager, actor, structureId, 'salary_created', {
        employee_id: id,
        effective_from: dto.effective_from,
        lines: dto.lines,
        reason: dto.reason,
      });
      return { id: structureId };
    });
  }
  edit(actor: Principal, id: string, dto: SalaryEditDto) {
    return this.context.write(actor, async (manager) => {
      const structure = await manager
        .getRepository(SalaryStructure)
        .findOneBy({ tenant_id: actor.tenantId, id });
      if (!structure) throw new NotFoundException('Salary structure not found');
      await this.context.unlockedDates(
        manager,
        actor.tenantId!,
        String(structure.effective_from),
        structure.effective_to as string | undefined,
      );
      await this.validateLines(manager, actor.tenantId!, dto.lines);
      const before = await this.lines(manager, actor.tenantId!, id);
      // Keep removed component rows at zero, preserving history without runtime DELETE privileges.
      await manager
        .getRepository(SalaryStructureLine)
        .update(
          { tenant_id: actor.tenantId, salary_structure_id: id },
          { amount: '0.00' },
        );
      for (const line of dto.lines) {
        const old = before.find(
          (row) => row.component_id === line.component_id,
        );
        if (old)
          await manager
            .getRepository(SalaryStructureLine)
            .update(
              { tenant_id: actor.tenantId, id: old.id },
              { amount: money(cents(line.amount)) },
            );
        else
          await manager
            .getRepository(SalaryStructureLine)
            .insert({
              tenant_id: actor.tenantId,
              salary_structure_id: id,
              component_id: line.component_id,
              amount: money(cents(line.amount)),
            });
      }
      await this.context.audit(manager, actor, id, 'salary_updated', {
        before,
        after: dto.lines,
        reason: dto.reason,
      });
      return { id };
    });
  }
  component(actor: Principal, dto: SalaryComponentDto, id?: string) {
    return this.context.write(actor, async (manager) => {
      const repository = manager.getRepository(SalaryComponent);
      const previous = id
        ? await repository.findOneBy({ tenant_id: actor.tenantId, id })
        : null;
      if (id && !previous) throw new NotFoundException('Component not found');
      if (
        previous &&
        previous.kind !== dto.kind &&
        (await manager
          .getRepository(SalaryStructureLine)
          .existsBy({ tenant_id: actor.tenantId, component_id: id }))
      )
        throw new ConflictException(
          'A component used in salary structures cannot change between earning and deduction',
        );
      const values: object = dto;
      let recordId = id;
      if (id)
        await repository.update(
          { tenant_id: actor.tenantId, id },
          { ...values },
        );
      else
        recordId = String(
          (await repository.insert({ tenant_id: actor.tenantId, ...values }))
            .identifiers[0].id,
        );
      await this.context.audit(manager, actor, recordId!, 'component_saved', {
        before: previous,
        after: dto,
      });
      return repository.findOneByOrFail({
        tenant_id: actor.tenantId,
        id: recordId,
      });
    });
  }
}

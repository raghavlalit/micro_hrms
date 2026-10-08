import { ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { EmployeePayrollService } from '../employees/employee-payroll.service';
import { LeavePayrollService } from '../leave/leave-payroll.service';
import { AttendancePayrollService } from '../attendance/attendance-payroll.service';
import { SalaryStructure } from './payroll.schemas';
import { SalaryService } from './salary.service';
import { cents, datesInMonth, divideRounded, money } from './payroll-money';
export interface CalculatedLine {
  component_id: string | null;
  component_code: string;
  component_name: string;
  kind: string;
  amount: string;
}
export interface PayrollSnapshot {
  employee: { id: string; name: string; employee_code: string };
  employment: {
    joining_date: string;
    termination_date: string | null;
    status: string;
  };
  company_name: string;
  currency: string;
  calendar_days: number;
  employed_days: number;
  unpaid_half_units: number;
  salary_revisions: unknown[];
  unpaid_leave: unknown[];
}
@Injectable()
export class PayrollCalculationService {
  constructor(
    readonly employees: EmployeePayrollService,
    readonly leave: LeavePayrollService,
    readonly attendance: AttendancePayrollService,
    readonly salaries: SalaryService,
  ) {}
  async calculate(
    manager: EntityManager,
    tenantId: string,
    run: Record<string, unknown>,
    tenant: Record<string, unknown>,
  ) {
    const from = String(run.period_start),
      to = String(run.period_end),
      dates = datesInMonth(from.slice(0, 7));
    const config = run.calculation_config as {
      unpaid_leave_deduction?: boolean;
    };
    const employees = await this.employees.period(manager, tenantId, from, to);
    const leave = await this.leave.period(manager, tenantId, from, to);
    const pendingCorrections = await this.attendance.pending(
      manager,
      tenantId,
      from,
      to,
    );
    const excluded = employees
      .filter(
        (employee) =>
          !['active', 'on_notice', 'terminated'].includes(employee.status),
      )
      .map((employee) => ({
        id: employee.id,
        name: `${employee.first_name} ${employee.last_name}`,
        reason: `Employee status: ${employee.status}`,
      }));
    const eligible = employees.filter((employee) =>
      ['active', 'on_notice', 'terminated'].includes(employee.status),
    );
    if (!eligible.length)
      throw new ConflictException(
        'No eligible employees in this payroll month',
      );
    const items = [];
    for (const employee of eligible) {
      const employedDates = dates.filter(
        (date) =>
          date >= employee.joining_date &&
          (!employee.termination_date || date <= employee.termination_date),
      );
      const structures = await manager
        .getRepository(SalaryStructure)
        .createQueryBuilder('structure')
        .where(
          'structure.tenant_id = :tenantId AND structure.employee_id = :employeeId AND structure.effective_from <= :to AND (structure.effective_to IS NULL OR structure.effective_to >= :from)',
          { tenantId, employeeId: employee.id, from, to },
        )
        .orderBy('structure.effective_from', 'ASC')
        .getMany();
      const revisions = [];
      for (const structure of structures) {
        if (structure.currency !== run.currency)
          throw new ConflictException(
            `Salary currency differs from run currency for ${employee.employee_code}`,
          );
        revisions.push({
          id: String(structure.id),
          effective_from: String(structure.effective_from),
          effective_to: structure.effective_to as string | null,
          lines: await this.salaries.lines(
            manager,
            tenantId,
            String(structure.id),
          ),
        });
      }
      const weighted = new Map<
        string,
        { line: CalculatedLine; numerator: bigint }
      >();
      let unpaidNumerator = 0n;
      const unpaid = config.unpaid_leave_deduction
        ? leave.unpaid.filter(
            (day) =>
              day.employee_id === employee.id &&
              employedDates.includes(day.date),
          )
        : [];
      for (const date of employedDates) {
        const matches = revisions.filter(
          (revision) =>
            revision.effective_from <= date &&
            (!revision.effective_to || revision.effective_to >= date),
        );
        if (matches.length !== 1)
          throw new ConflictException(
            `Assign one salary structure covering ${date} for ${employee.employee_code}`,
          );
        const halfUnits = unpaid
          .filter((day) => day.date === date)
          .reduce((sum, day) => sum + day.half_units, 0);
        if (halfUnits > 2)
          throw new ConflictException(
            'Overlapping approved unpaid leave requires reconciliation',
          );
        for (const line of matches[0].lines) {
          const entry = weighted.get(line.component_id) ?? {
            line: {
              component_id: line.component_id,
              component_code: line.code,
              component_name: line.name,
              kind: line.kind,
              amount: '0.00',
            },
            numerator: 0n,
          };
          entry.numerator += cents(line.amount);
          weighted.set(line.component_id, entry);
          if (line.kind === 'earning')
            unpaidNumerator += cents(line.amount) * BigInt(halfUnits);
        }
      }
      const lines = [...weighted.values()].map((entry) => ({
        ...entry.line,
        amount: money(divideRounded(entry.numerator, BigInt(dates.length))),
      }));
      const loss = divideRounded(unpaidNumerator, BigInt(dates.length * 2));
      if (loss > 0n)
        lines.push({
          component_id: null,
          component_code: 'SYSTEM_UNPAID_LEAVE',
          component_name: 'Approved unpaid leave',
          kind: 'deduction',
          amount: money(loss),
        });
      const gross = lines
          .filter((line) => line.kind === 'earning')
          .reduce((sum, line) => sum + cents(line.amount), 0n),
        deductions = lines
          .filter((line) => line.kind === 'deduction')
          .reduce((sum, line) => sum + cents(line.amount), 0n);
      if (deductions > gross)
        throw new ConflictException(
          `Deductions exceed earnings for ${employee.employee_code}; correct salary or unpaid-leave inputs`,
        );
      const snapshot: PayrollSnapshot = {
        employee: {
          id: employee.id,
          name: `${employee.first_name} ${employee.last_name}`,
          employee_code: employee.employee_code,
        },
        employment: {
          joining_date: employee.joining_date,
          termination_date: employee.termination_date,
          status: employee.status,
        },
        company_name: String(tenant.name),
        currency: String(run.currency),
        calendar_days: dates.length,
        employed_days: employedDates.length,
        unpaid_half_units: unpaid.reduce((sum, day) => sum + day.half_units, 0),
        salary_revisions: revisions,
        unpaid_leave: unpaid,
      };
      items.push({
        employee_id: employee.id,
        gross: money(gross),
        deductions: money(deductions),
        net: money(gross - deductions),
        input_snapshot: snapshot,
        lines,
      });
    }
    // Stable ordering + captured inputs detect changes between calculation, review and locking.
    const hash = createHash('sha256')
      .update(
        JSON.stringify({
          items,
          excluded,
          unpaid_leave_deduction: !!config.unpaid_leave_deduction,
        }),
      )
      .digest('hex');
    return {
      items,
      excluded,
      input_hash: hash,
      pending_leave: leave.pending,
      pending_corrections: pendingCorrections,
    };
  }
}

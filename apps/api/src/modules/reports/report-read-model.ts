import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { ReportAccess, ReportScope } from './report-access.service';
import { ReportKind, ReportQueryDto } from './report.dto';

export interface ReportColumn {
  key: string;
  label: string;
  type?: 'number';
}
export type ReportRow = Record<string, string | number | null>;
export const identityColumns: ReportColumn[] = [
  { key: 'employee_code', label: 'Employee code' },
  { key: 'employee_name', label: 'Employee name' },
];
export const reportColumns: Record<ReportKind, ReportColumn[]> = {
  employees: [
    ...identityColumns,
    ...[
      'department',
      'designation',
      'location',
      'manager',
      'joining_date',
      'status',
    ].map((key) => ({ key, label: key.replace('_', ' ') })),
  ],
  attendance: [
    ...identityColumns,
    { key: 'work_date', label: 'Work date' },
    { key: 'status', label: 'Status' },
    { key: 'check_in', label: 'Check in (UTC)' },
    { key: 'check_out', label: 'Check out (UTC)' },
    { key: 'worked_minutes', label: 'Worked minutes', type: 'number' },
    { key: 'leave_units', label: 'Approved leave days', type: 'number' },
    { key: 'projected', label: 'Calendar projection' },
  ],
  leave: [
    ...identityColumns,
    ...['leave_type', 'start_date', 'end_date'].map((key) => ({
      key,
      label: key.replace('_', ' '),
    })),
    { key: 'units', label: 'Request days', type: 'number' },
    { key: 'status', label: 'Status' },
    { key: 'reviewer', label: 'Reviewer' },
  ],
  balances: [
    ...identityColumns,
    { key: 'leave_type', label: 'Leave type' },
    { key: 'period_start', label: 'Period start' },
    { key: 'period_end', label: 'Period end' },
    ...['credited', 'adjusted', 'used', 'pending', 'available'].map((key) => ({
      key,
      label: key,
      type: 'number' as const,
    })),
  ],
  payroll: [
    ...identityColumns,
    { key: 'period_start', label: 'Period start' },
    { key: 'currency', label: 'Currency' },
    { key: 'run_status', label: 'Run status' },
    { key: 'calculation_version', label: 'Calculation', type: 'number' },
    ...['gross', 'deductions', 'net'].map((key) => ({
      key,
      label: key,
      type: 'number' as const,
    })),
  ],
  components: [
    ...identityColumns,
    { key: 'currency', label: 'Currency' },
    { key: 'run_status', label: 'Run status' },
    { key: 'calculation_version', label: 'Calculation', type: 'number' },
    { key: 'component_code', label: 'Component code' },
    { key: 'component_name', label: 'Component name' },
    { key: 'kind', label: 'Type' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'is_manual', label: 'Manual' },
  ],
};

/** Deliberately designed, read-only projections across domain tables. Each join
 * carries tenant_id, each select is an allowlist, and no business writes live here. */
@Injectable()
export class ReportReadModel {
  constructor(readonly access: ReportAccess) {}
  employees(
    manager: EntityManager,
    actor: Principal,
    scope: ReportScope,
    dto: Partial<ReportQueryDto> = {},
    includeArchived = false,
  ) {
    const query = manager
      .createQueryBuilder()
      .from('employees', 'employee')
      .where('employee.tenant_id = :tenantId', { tenantId: actor.tenantId });
    if (!includeArchived) query.andWhere('employee.archived_at IS NULL');
    this.access.apply(query, scope);
    if (dto.employee_id)
      query.andWhere('employee.id = :employeeId', {
        employeeId: dto.employee_id,
      });
    if (dto.department_id)
      query.andWhere('employee.department_id = :departmentId', {
        departmentId: dto.department_id,
      });
    if (dto.location_id)
      query.andWhere('employee.location_id = :locationId', {
        locationId: dto.location_id,
      });
    if (dto.search)
      query.andWhere(
        '(employee.employee_code ILIKE :search OR employee.first_name ILIKE :search OR employee.last_name ILIKE :search)',
        { search: `%${dto.search.replace(/[\\%_]/g, '\\$&')}%` },
      );
    return query;
  }
  async query(
    manager: EntityManager,
    actor: Principal,
    scope: ReportScope,
    kind: Exclude<ReportKind, 'attendance'>,
    dto: ReportQueryDto,
  ) {
    const payroll = kind === 'payroll' || kind === 'components';
    const query = this.employees(manager, actor, scope, dto, payroll).select([
      'employee.id AS employee_id',
      'employee.employee_code AS employee_code',
      "concat(employee.first_name,' ',employee.last_name) AS employee_name",
    ]);
    if (kind === 'employees') {
      for (const [alias, table, key] of [
        ['department', 'departments', 'department_id'],
        ['designation', 'designations', 'designation_id'],
        ['location', 'locations', 'location_id'],
      ])
        query
          .leftJoin(
            table,
            alias,
            `${alias}.id = employee.${key} AND ${alias}.tenant_id = employee.tenant_id`,
          )
          .addSelect(`${alias}.name`, alias);
      query
        .leftJoin(
          'employees',
          'supervisor',
          'supervisor.id = employee.manager_id AND supervisor.tenant_id = employee.tenant_id',
        )
        .addSelect(
          "CASE WHEN supervisor.id IS NULL THEN NULL ELSE concat(supervisor.first_name,' ',supervisor.last_name) END",
          'manager',
        )
        .addSelect('employee.joining_date::text', 'joining_date')
        .addSelect('employee.status', 'status');
      if (dto.status)
        query.andWhere('employee.status = :status', { status: dto.status });
    } else if (kind === 'leave') {
      query
        .innerJoin(
          'leave_requests',
          'request',
          'request.employee_id = employee.id AND request.tenant_id = employee.tenant_id',
        )
        .innerJoin(
          'leave_types',
          'type',
          'type.id = request.leave_type_id AND type.tenant_id = request.tenant_id',
        )
        .leftJoin(
          'users',
          'reviewer',
          'reviewer.id = request.reviewer_id AND reviewer.tenant_id = request.tenant_id',
        )
        .addSelect([
          'request.id AS id',
          'type.name AS leave_type',
          'request.start_date::text AS start_date',
          'request.end_date::text AS end_date',
          'request.units AS units',
          'request.status AS status',
          'reviewer.display_name AS reviewer',
        ])
        .andWhere('request.start_date <= :to AND request.end_date >= :from', {
          from: dto.from,
          to: dto.to,
        });
      if (dto.status)
        query.andWhere('request.status = :status', { status: dto.status });
      query
        .orderBy('request.start_date', 'DESC')
        .addOrderBy('request.id', 'ASC');
    } else if (kind === 'balances') {
      query
        .innerJoin(
          'leave_balances',
          'balance',
          'balance.employee_id = employee.id AND balance.tenant_id = employee.tenant_id',
        )
        .innerJoin(
          'leave_types',
          'type',
          'type.id = balance.leave_type_id AND type.tenant_id = balance.tenant_id',
        )
        .addSelect([
          'balance.id AS id',
          'type.name AS leave_type',
          'balance.period_start::text AS period_start',
          'balance.period_end::text AS period_end',
          'balance.credited AS credited',
          'balance.adjusted AS adjusted',
          'balance.used AS used',
          'balance.pending AS pending',
          '(balance.credited + balance.adjusted - balance.used - balance.pending)::text AS available',
        ])
        .andWhere('balance.period_start = :yearStart', {
          yearStart: `${dto.year}-01-01`,
        })
        .orderBy('employee.employee_code', 'ASC')
        .addOrderBy('balance.id', 'ASC');
    } else {
      if (!dto.run_id) throw new BadRequestException('Select a payroll run');
      const run = await manager
        .createQueryBuilder()
        .from('payroll_runs', 'run')
        .select('run.id', 'id')
        .where('run.tenant_id = :tenantId AND run.id = :runId', {
          tenantId: actor.tenantId,
          runId: dto.run_id,
        })
        .getRawOne();
      if (!run) throw new NotFoundException('Payroll run not found');
      query
        .innerJoin(
          'payroll_employees',
          'item',
          'item.employee_id = employee.id AND item.tenant_id = employee.tenant_id',
        )
        .innerJoin(
          'payroll_runs',
          'run',
          'run.id = item.payroll_run_id AND run.tenant_id = item.tenant_id AND run.calculation_version = item.calculation_version',
        )
        .andWhere('run.id = :runId', { runId: dto.run_id })
        .select([
          'employee.id AS employee_id',
          "COALESCE(item.input_snapshot->'employee'->>'employee_code',employee.employee_code) AS employee_code",
          "COALESCE(item.input_snapshot->'employee'->>'name',concat(employee.first_name,' ',employee.last_name)) AS employee_name",
          'run.period_start::text AS period_start',
          'run.currency AS currency',
          'run.status AS run_status',
          'item.calculation_version AS calculation_version',
        ]);
      if (kind === 'payroll')
        query
          .addSelect([
            'item.id AS id',
            'item.gross AS gross',
            'item.deductions AS deductions',
            'item.net AS net',
          ])
          .orderBy('employee.employee_code', 'ASC')
          .addOrderBy('item.id', 'ASC');
      else
        query
          .innerJoin(
            'payroll_lines',
            'line',
            'line.payroll_employee_id = item.id AND line.tenant_id = item.tenant_id',
          )
          .addSelect([
            'line.id AS id',
            'line.component_code AS component_code',
            'line.component_name AS component_name',
            'line.kind AS kind',
            'line.amount AS amount',
            "CASE WHEN line.is_manual THEN 'Yes' ELSE 'No' END AS is_manual",
          ])
          .orderBy('employee.employee_code', 'ASC')
          .addOrderBy('line.id', 'ASC');
    }
    if (kind === 'employees')
      query
        .orderBy('employee.employee_code', 'ASC')
        .addOrderBy('employee.id', 'ASC');
    return query;
  }
  async options(
    manager: EntityManager,
    actor: Principal,
    scope: ReportScope,
    kind: ReportKind,
  ) {
    const includeArchived = kind === 'payroll' || kind === 'components';
    const departments = await this.employees(
      manager,
      actor,
      scope,
      {},
      includeArchived,
    )
      .innerJoin(
        'departments',
        'department',
        'department.id = employee.department_id AND department.tenant_id = employee.tenant_id',
      )
      .select('department.id', 'id')
      .distinct(true)
      .addSelect('department.name', 'name')
      .orderBy('department.name', 'ASC')
      .getRawMany();
    const locations = await this.employees(
      manager,
      actor,
      scope,
      {},
      includeArchived,
    )
      .innerJoin(
        'locations',
        'location',
        'location.id = employee.location_id AND location.tenant_id = employee.tenant_id',
      )
      .select('location.id', 'id')
      .distinct(true)
      .addSelect('location.name', 'name')
      .orderBy('location.name', 'ASC')
      .getRawMany();
    const runs =
      kind === 'payroll' || kind === 'components'
        ? await manager
            .createQueryBuilder()
            .from('payroll_runs', 'run')
            .select([
              'run.id AS id',
              'run.period_start::text AS period_start',
              'run.status AS status',
              'run.currency AS currency',
            ])
            .where('run.tenant_id = :tenantId', { tenantId: actor.tenantId })
            .orderBy('run.period_start', 'DESC')
            .limit(120)
            .getRawMany()
        : [];
    return { departments, locations, runs };
  }
}

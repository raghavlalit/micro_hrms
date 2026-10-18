import {
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
} from '@nestjs/common';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Tenant } from '../tenants/tenant.schemas';
import { AuditLog } from '../audit/audit.schemas';
import {
  AttendanceClock,
  AttendanceService,
} from '../attendance/attendance.service';
import { companyToday } from '../holidays/holiday-calendar';
import { ReportAccess } from './report-access.service';
import { REPORT_KINDS, ReportKind, ReportQueryDto } from './report.dto';
import { ReportReadModel, reportColumns, ReportRow } from './report-read-model';
import { reportCsv } from './report-csv';
export const REPORT_ROW_LIMIT = 5000;
@Injectable()
export class ReportsService {
  constructor(
    readonly tenants: TenantDatabaseService,
    readonly access: ReportAccess,
    readonly model: ReportReadModel,
    readonly attendance: AttendanceService,
    readonly clock: AttendanceClock,
  ) {}
  kind(value: string): ReportKind {
    if (!REPORT_KINDS.includes(value as ReportKind))
      throw new BadRequestException('Unknown report type');
    return value as ReportKind;
  }
  async options(actor: Principal, kind: ReportKind) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const scope = await this.access.resolve(manager, actor, kind);
      const tenant = await manager
        .getRepository(Tenant)
        .findOneByOrFail({ id: actor.tenantId });
      return {
        kind,
        scope: scope.level,
        available: REPORT_KINDS.filter((kind) =>
          this.access.scope(actor, kind),
        ),
        today: companyToday(String(tenant.timezone), this.clock.now()),
        ...(await this.model.options(manager, actor, scope, kind)),
      };
    });
  }
  filters(kind: ReportKind, dto: ReportQueryDto, today: string) {
    const result = Object.assign(new ReportQueryDto(), dto);
    if (kind === 'attendance' || kind === 'leave') {
      result.from ??= today.slice(0, 7) + '-01';
      result.to ??= today;
      const days =
        (Date.parse(result.to) - Date.parse(result.from)) / 86400000 + 1;
      if (days < 1 || days > (kind === 'attendance' ? 31 : 366))
        throw new BadRequestException(
          `Choose an ordered date range of at most ${kind === 'attendance' ? 31 : 366} days`,
        );
    } else if (dto.from || dto.to)
      throw new BadRequestException(
        'Date ranges apply to attendance and leave request reports',
      );
    if (kind === 'balances') result.year ??= Number(today.slice(0, 4));
    else if (dto.year)
      throw new BadRequestException('Year applies to the leave balance report');
    if (!['payroll', 'components'].includes(kind) && dto.run_id)
      throw new BadRequestException(
        'Payroll run applies only to payroll reports',
      );
    const statuses: Record<string, string[]> = {
      employees: ['invited', 'active', 'on_notice', 'inactive', 'terminated'],
      leave: ['pending', 'approved', 'rejected', 'cancelled'],
      attendance: [
        'present',
        'absent',
        'half_day',
        'leave',
        'holiday',
        'weekly_off',
        'pending',
        'incomplete',
        'not_applicable',
      ],
    };
    if (dto.status && !statuses[kind]?.includes(dto.status))
      throw new BadRequestException('Invalid status for this report');
    return result;
  }
  async data(actor: Principal, kind: ReportKind, dto: ReportQueryDto) {
    const { employee_ids: _, ...data } = await this.backgroundData(
      actor,
      kind,
      dto,
      REPORT_ROW_LIMIT,
    );
    return data;
  }
  async backgroundData(
    actor: Principal,
    kind: ReportKind,
    dto: ReportQueryDto,
    rowLimit = 100000,
  ) {
    const context = await this.tenants.withTenant(
      actor.tenantId!,
      async (manager) => {
        const scope = await this.access.resolve(manager, actor, kind);
        const tenant = await manager
          .getRepository(Tenant)
          .findOneByOrFail({ id: actor.tenantId });
        const today = companyToday(String(tenant.timezone), this.clock.now());
        const filters = this.filters(kind, dto, today);
        if (kind === 'attendance') {
          const days =
            (Date.parse(filters.to!) - Date.parse(filters.from!)) / 86400000 +
            1;
          const people = await this.model
            .employees(manager, actor, scope, filters)
            .select(['employee.id AS id'])
            .orderBy('employee.employee_code', 'ASC')
            .addOrderBy('employee.id', 'ASC')
            .limit(Math.floor(rowLimit / days) + 1)
            .getRawMany<{ id: string }>();
          if (people.length * days > rowLimit)
            throw new PayloadTooLargeException(
              `Report exceeds ${rowLimit} rows. Use background export or narrow employee/organization filters.`,
            );
          return { scope, filters, today, people, rows: [] as ReportRow[] };
        }
        const query = await this.model.query(
          manager,
          actor,
          scope,
          kind,
          filters,
        );
        const rows = await query.limit(rowLimit + 1).getRawMany<ReportRow>();
        if (rows.length > rowLimit)
          throw new PayloadTooLargeException(
            `Report exceeds ${rowLimit} rows. Use background export or narrow the filters.`,
          );
        return { scope, filters, today, people: [] as { id: string }[], rows };
      },
    );
    if (kind === 'attendance') {
      // Reuse the transactional attendance calendar, including approved leave,
      // weekly offs, holidays, incomplete punches and historical rule snapshots.
      const months: string[] = [];
      const cursor = new Date(
        context.filters.from!.slice(0, 7) + '-01T00:00:00Z',
      );
      while (
        cursor.toISOString().slice(0, 7) <= context.filters.to!.slice(0, 7)
      ) {
        months.push(cursor.toISOString().slice(0, 7));
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
      }
      for (const person of context.people)
        for (const month of months) {
          const calendar = await this.attendance.calendar(
            actor,
            month,
            person.id,
          );
          for (const day of calendar.items) {
            if (
              day.work_date < context.filters.from! ||
              day.work_date > context.filters.to! ||
              (dto.status && day.status !== dto.status)
            )
              continue;
            context.rows.push({
              employee_id: person.id,
              employee_code: calendar.employee.employee_code,
              employee_name: calendar.employee.name,
              work_date: day.work_date,
              status: day.status,
              check_in: day.check_in,
              check_out: day.check_out,
              worked_minutes: day.worked_minutes,
              leave_units: day.leave_units,
              projected: day.projected ? 'Yes' : 'No',
            });
          }
        }
    }
    // Limit public fields to the report definition; never return joined private data.
    const columns = reportColumns[kind];
    const rows = context.rows.map(
      (row) =>
        Object.fromEntries(
          columns.map((column) => [column.key, row[column.key] ?? null]),
        ) as ReportRow,
    );
    return {
      kind,
      employee_ids: [
        ...new Set(context.rows.map((row) => String(row.employee_id))),
      ],
      scope: context.scope.level,
      columns,
      rows,
      total: rows.length,
      filters: context.filters,
      today: context.today,
      generated_at: this.clock.now().toISOString(),
      row_limit: rowLimit,
    };
  }
  async view(actor: Principal, kind: ReportKind, dto: ReportQueryDto) {
    const data = await this.data(actor, kind, dto);
    return {
      ...data,
      rows: data.rows.slice((dto.page - 1) * dto.limit, dto.page * dto.limit),
      page: dto.page,
      limit: dto.limit,
    };
  }
  async export(actor: Principal, kind: ReportKind, dto: ReportQueryDto) {
    const data = await this.data(actor, kind, dto);
    await this.tenants.withTenant(actor.tenantId!, (manager) =>
      manager.getRepository(AuditLog).insert({
        tenant_id: actor.tenantId,
        actor_id: actor.id,
        entity_type: 'report',
        action: 'report.exported',
        metadata: {
          kind,
          scope: data.scope,
          rows: data.total,
          from: data.filters.from,
          to: data.filters.to,
          year: data.filters.year,
          run_id: data.filters.run_id,
        },
      }),
    );
    return {
      content: reportCsv(data.columns, data.rows),
      filename: `${kind}-${data.today}.csv`,
    };
  }
}

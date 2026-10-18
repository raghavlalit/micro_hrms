import { Injectable } from '@nestjs/common';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Tenant } from '../tenants/tenant.schemas';
import { ReportAccess, ReportScope } from '../reports/report-access.service';
import { ReportReadModel } from '../reports/report-read-model';
import {
  AttendanceClock,
  AttendanceService,
} from '../attendance/attendance.service';
import { HolidayService } from '../holidays/holiday.service';
import { companyToday } from '../holidays/holiday-calendar';
import { LeaveQueryService } from '../leave/leave-query.service';
import { PayslipService } from '../payroll/payslip.service';

export interface Milestone {
  name: string;
  date: string;
  kind: 'Birthday' | 'Work anniversary';
}
@Injectable()
export class DashboardService {
  constructor(
    readonly tenants: TenantDatabaseService,
    readonly access: ReportAccess,
    readonly model: ReportReadModel,
    readonly attendance: AttendanceService,
    readonly clock: AttendanceClock,
    readonly holidays: HolidayService,
    readonly leave: LeaveQueryService,
    readonly payslips: PayslipService,
  ) {}
  async overview(actor: Principal) {
    const has = (permission: string) => actor.permissions.includes(permission);
    const context = await this.tenants.withTenant(
      actor.tenantId!,
      async (manager) => {
        const tenant = await manager
          .getRepository(Tenant)
          .findOneByOrFail({ id: actor.tenantId });
        const today = companyToday(String(tenant.timezone), this.clock.now());
        const end = new Date(today + 'T00:00:00Z');
        end.setUTCDate(end.getUTCDate() + 30);
        const through = end.toISOString().slice(0, 10);
        const self = await manager
          .createQueryBuilder()
          .from('employees', 'employee')
          .select('employee.id', 'id')
          .where(
            'employee.tenant_id = :tenantId AND employee.user_id = :userId AND employee.archived_at IS NULL',
            { tenantId: actor.tenantId, userId: actor.id },
          )
          .getRawOne<{ id: string }>();
        const employeeScope = this.access.scope(actor, 'employees', false)
          ? await this.access.resolve(manager, actor, 'employees', false)
          : null;
        let workforce: { scope: string; total: number; active: number } | null =
          null;
        if (employeeScope) {
          const row = await this.model
            .employees(manager, actor, employeeScope)
            .select('COUNT(*)::int', 'total')
            .addSelect(
              "COUNT(*) FILTER (WHERE employee.status IN ('active','on_notice'))::int",
              'active',
            )
            .getRawOne<{ total: number; active: number }>();
          workforce = {
            scope: employeeScope.level,
            total: row!.total,
            active: row!.active,
          };
        }
        const attendanceScope = this.access.scope(actor, 'attendance', false)
          ? await this.access.resolve(manager, actor, 'attendance', false)
          : null;
        // Attendance status is calculated by the domain service, not inferred from
        // missing punches. Bound the live dashboard work; larger rosters use filters.
        const people = attendanceScope
          ? await this.model
              .employees(manager, actor, attendanceScope)
              .select('employee.id', 'id')
              .orderBy('employee.id', 'ASC')
              .limit(501)
              .getRawMany<{ id: string }>()
          : [];
        const pending: { kind: string; scope: string; count: number }[] = [];
        for (const [kind, table] of [
          ['attendance', 'attendance_regularizations'],
          ['leave', 'leave_requests'],
        ] as const) {
          const scope = this.access.scope(actor, kind, false);
          if (!scope || scope === 'self') continue;
          const resolved = await this.access.resolve(
            manager,
            actor,
            kind,
            false,
          );
          const query = this.model
            .employees(manager, actor, resolved)
            .innerJoin(
              table,
              'request',
              'request.employee_id = employee.id AND request.tenant_id = employee.tenant_id',
            )
            .andWhere('request.status = :status', { status: 'pending' });
          if (self)
            query.andWhere('employee.id <> :selfId', { selfId: self.id });
          const count = await query
            .select('COUNT(*)::int', 'count')
            .getRawOne<{ count: number }>();
          pending.push({ kind, scope, count: count!.count });
        }
        const payroll = has('payroll.manage')
          ? await manager
              .createQueryBuilder()
              .from('payroll_runs', 'run')
              .select([
                'run.id AS id',
                'run.period_start::text AS period_start',
                'run.status AS status',
                'run.published_at AS published_at',
              ])
              .where('run.tenant_id = :tenantId', { tenantId: actor.tenantId })
              .orderBy('run.period_start', 'DESC')
              .limit(6)
              .getRawMany<{
                id: string;
                period_start: string;
                status: string;
                published_at: string | null;
              }>()
          : null;
        const milestones: Milestone[] = [];
        // Birthdays are an HR-only projection: never return birth years or ages.
        if (has('employees.manage')) {
          const upcoming = Array.from({ length: 31 }, (_, index) => {
            const date = new Date(today + 'T00:00:00Z');
            date.setUTCDate(date.getUTCDate() + index);
            return date.toISOString().slice(0, 10);
          });
          const rows = await this.model
            .employees(manager, actor, { level: 'company' })
            .select(
              "concat(employee.first_name,' ',employee.last_name)",
              'name',
            )
            .addSelect("to_char(employee.date_of_birth, 'MM-DD')", 'birthday')
            .addSelect('employee.joining_date::text', 'joining')
            .andWhere(
              "employee.status IN ('active','on_notice') AND employee.joining_date <= :today",
              { today },
            )
            .andWhere(
              "(to_char(employee.date_of_birth, 'MM-DD') IN (:...dates) OR to_char(employee.joining_date, 'MM-DD') IN (:...dates))",
              { dates: upcoming.map((date) => date.slice(5)) },
            )
            .getRawMany<{
              name: string;
              birthday: string | null;
              joining: string;
            }>();
          for (const row of rows)
            for (const date of upcoming) {
              if (row.birthday === date.slice(5))
                milestones.push({ name: row.name, date, kind: 'Birthday' });
              if (
                row.joining.slice(5) === date.slice(5) &&
                row.joining.slice(0, 4) < date.slice(0, 4)
              )
                milestones.push({
                  name: row.name,
                  date,
                  kind: 'Work anniversary',
                });
            }
          milestones.sort(
            (a, b) =>
              a.date.localeCompare(b.date) || a.name.localeCompare(b.name),
          );
        }
        return {
          today,
          through,
          timezone: String(tenant.timezone),
          selfId: self?.id,
          workforce,
          attendanceScope,
          people,
          pending,
          payroll,
          milestones: milestones.slice(0, 20),
        };
      },
    );
    const attendance = await this.attendanceSummary(
      actor,
      context.attendanceScope,
      context.people,
      context.today,
    );
    const holidayYears = [
      ...new Set([
        Number(context.today.slice(0, 4)),
        Number(context.through.slice(0, 4)),
      ]),
    ];
    const holidayCalendars = await Promise.all(
      holidayYears.map((year) => this.holidays.calendar(actor, { year })),
    );
    const holidays = holidayCalendars
      .flatMap((calendar) => calendar.items)
      .filter(
        (item) =>
          item.holiday_date >= context.today &&
          item.holiday_date <= context.through,
      )
      .sort((a, b) => a.holiday_date.localeCompare(b.holiday_date))
      .slice(0, 10);
    const balances =
      context.selfId && has('leave.self')
        ? (await this.leave.overview(actor, Number(context.today.slice(0, 4))))
            .balances
        : null;
    const payslips = has('payslips.read.self')
      ? (await this.payslips.list(actor, { page: 1, limit: 3 })).items
      : null;
    return {
      today: context.today,
      timezone: context.timezone,
      generated_at: this.clock.now().toISOString(),
      linked_employee: !!context.selfId,
      workforce: context.workforce,
      attendance,
      pending: context.pending,
      holidays,
      holiday_scope: holidayCalendars[0].scope,
      milestones: context.milestones,
      payroll: context.payroll,
      balances,
      payslips,
    };
  }
  private async attendanceSummary(
    actor: Principal,
    scope: ReportScope | null,
    people: { id: string }[],
    today: string,
  ) {
    if (!scope) return null;
    if (people.length > 500)
      return {
        scope: scope.level,
        available: false,
        reason:
          'Live attendance summary supports up to 500 employees. Use filtered attendance reports.',
        counts: null,
        own: null,
      };
    const counts: Record<string, number> = {
      present: 0,
      absent: 0,
      half_day: 0,
      leave: 0,
      holiday: 0,
      weekly_off: 0,
      pending: 0,
      incomplete: 0,
      not_applicable: 0,
      on_leave: 0,
      checked_in: 0,
    };
    let own: {
      status: string;
      check_in: string | null;
      check_out: string | null;
    } | null = null;
    for (const person of people) {
      const calendar = await this.attendance.calendar(
        actor,
        today.slice(0, 7),
        person.id,
      );
      const day = calendar.items.find((item) => item.work_date === today)!;
      counts[day.status] = (counts[day.status] ?? 0) + 1;
      if (day.leave_units > 0) counts.on_leave++;
      if (day.check_in) counts.checked_in++;
      if (scope.level === 'self')
        own = {
          status: day.status,
          check_in: day.check_in,
          check_out: day.check_out,
        };
    }
    return { scope: scope.level, available: true, reason: null, counts, own };
  }
}

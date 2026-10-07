import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, QueryFailedError } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Tenant } from '../tenants/tenant.schemas';
import { AuditLog } from '../audit/audit.schemas';
import { HolidayService } from '../holidays/holiday.service';
import { companyToday } from '../holidays/holiday-calendar';
import { Attendance } from './attendance.schemas';
import { LeaveAttendanceService } from '../leave/leave-attendance.service';
import { AttendancePolicy } from './attendance-policy.service';
import { AttendanceRepository } from './attendance-repository';
import type { AttendanceEmployee, AttendanceRules } from './attendance.types';
import { AttendanceAdjustmentDto, AttendancePeopleDto } from './attendance.dto';
import {
  attendanceBaseline,
  calculateAttendance,
  displayedStatus,
  iso,
  monthDates,
  sameWorkDate,
  weekday,
} from './attendance-calculation';

@Injectable()
export class AttendanceClock {
  now() {
    return new Date();
  }
}

@Injectable()
export class AttendanceService {
  constructor(
    readonly tenants: TenantDatabaseService,
    readonly policy: AttendancePolicy,
    readonly repository: AttendanceRepository,
    readonly clock: AttendanceClock,
    private readonly holidays: HolidayService,
    readonly leave: LeaveAttendanceService,
  ) {}
  async write<T>(
    actor: Principal,
    work: (manager: EntityManager, timezone: string, now: Date) => Promise<T>,
  ) {
    try {
      return await this.tenants.withTenant(actor.tenantId!, async (manager) => {
        const tenant = await this.policy.lockTenant(manager, actor.tenantId!);
        return work(manager, String(tenant.timezone), this.clock.now());
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'Attendance or a pending correction already exists for this date',
        );
      throw error;
    }
  }
  async audit(
    manager: EntityManager,
    actor: Principal,
    id: string,
    action: string,
    metadata: object,
  ) {
    await manager
      .getRepository(AuditLog)
      .insert({
        tenant_id: actor.tenantId,
        actor_id: actor.id,
        entity_type: 'attendance',
        entity_id: id,
        action,
        metadata,
      });
  }
  people(actor: Principal, dto: AttendancePeopleDto) {
    if (!this.policy.reviews(actor))
      throw new ForbiddenException(
        'Team or company attendance access required',
      );
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = this.policy.employeeQuery(manager, actor.tenantId!);
      if (!this.policy.manages(actor))
        query.andWhere('employee.manager_id = :managerId', {
          managerId: (await this.policy.self(manager, actor)).id,
        });
      if (dto.search)
        query.andWhere(
          '(employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.employee_code ILIKE :search)',
          { search: `%${dto.search.replace(/[\\%_]/g, '\\$&')}%` },
        );
      const total = await query.getCount();
      const rows = await query
        .orderBy('employee.first_name', 'ASC')
        .addOrderBy('employee.id', 'ASC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany<AttendanceEmployee>();
      return {
        items: rows.map((row) => ({
          id: row.id,
          employee_code: row.employee_code,
          name: `${row.first_name} ${row.last_name}`,
          status: row.status,
        })),
        total,
      };
    });
  }
  calendar(actor: Principal, month?: string, employeeId?: string) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const employee = employeeId
        ? await this.policy.accessible(manager, actor, employeeId)
        : await this.policy.self(manager, actor);
      const tenant = await manager
        .getRepository(Tenant)
        .findOneByOrFail({ id: actor.tenantId });
      const timezone = String(tenant.timezone),
        today = companyToday(timezone, this.clock.now());
      const selectedMonth = month ?? today.slice(0, 7),
        dates = monthDates(selectedMonth);
      const records = await this.repository.month(
        manager,
        actor.tenantId!,
        employee.id,
        dates[0],
        dates[dates.length - 1],
      );
      const schedule = await this.policy.schedule(
        manager,
        actor.tenantId!,
        employee,
        timezone,
      );
      const holidays = await this.holidays.applicableDates(
        manager,
        actor.tenantId!,
        employee.location_id,
        dates[0],
        dates[dates.length - 1],
      );
      const active = ['active', 'on_notice'].includes(employee.status);
      const approvedLeave = await this.leave.approved(manager,actor.tenantId!,employee.id,dates[0],dates[dates.length-1]);
      const items = dates.map((date) => {
        const leaveUnits = approvedLeave.filter(day=>day.date===date).reduce((sum,day)=>sum+day.units,0);
        const row = records.find((record) => record.work_date === date);
        const rules = row?.source_metadata?.rules ?? {
          ...schedule,
          holiday: holidays.has(date),
          weekly_off:
            schedule.configured &&
            !schedule.working_days.includes(weekday(date)),
        };
        const applicable =
          date >= employee.joining_date &&
          (!employee.termination_date || date <= employee.termination_date) &&
          (active || employee.status === 'terminated');
        const status = row
          ? displayedStatus(row, today)
          : !applicable
            ? 'not_applicable'
            : rules.holiday
              ? 'holiday'
              : rules.weekly_off
                ? 'weekly_off'
                : date < today && rules.configured
                  ? 'absent'
                  : 'pending';
        return {
          id: row?.id ?? null,
          work_date: date,
          check_in: row ? iso(row.check_in) : null,
          check_out: row ? iso(row.check_out) : null,
          status: leaveUnits === 1 ? 'leave' : leaveUnits === 0.5 && (!row || row.status === 'absent') ? 'half_day' : status,
          leave_units: leaveUnits,
          worked_minutes: row?.worked_minutes ?? 0,
          late_minutes: row?.source_metadata?.late_minutes ?? 0,
          source: row?.source ?? 'calendar',
          timezone: rules.timezone,
          schedule_name: rules.schedule_name,
          projected: !row && !leaveUnits,
          future: date > today,
          can_request:
            leaveUnits < 1 &&
            employee.user_id === actor.id &&
            actor.permissions.includes('attendance.self') &&
            active &&
            applicable &&
            date <= today,
          can_adjust:
            leaveUnits < 1 &&
            this.policy.manages(actor) &&
            date <= today &&
            date >= employee.joining_date &&
            (!employee.termination_date || date <= employee.termination_date),
        };
      });
      const current = await this.repository.day(
        manager,
        actor.tenantId!,
        employee.id,
        today,
      );
      const todayRules =
        current?.source_metadata?.rules ??
        (await this.policy.dayRules(
          manager,
          actor.tenantId!,
          employee,
          today,
          timezone,
        ));
      const own =
        employee.user_id === actor.id &&
        actor.permissions.includes('attendance.self');
      const todayLeave = await this.leave.approved(manager,actor.tenantId!,employee.id,today,today);
      const fullDayLeave = todayLeave.reduce((sum,day)=>sum+day.units,0) >= 1;
      const workDateEligible =
        today >= employee.joining_date &&
        (!employee.termination_date || today <= employee.termination_date);
      return {
        employee: {
          id: employee.id,
          name: `${employee.first_name} ${employee.last_name}`,
          employee_code: employee.employee_code,
          status: employee.status,
        },
        month: selectedMonth,
        today,
        timezone,
        schedule: {
          name: todayRules.schedule_name,
          start_time: todayRules.start_time,
          end_time: todayRules.end_time,
          half_day_minutes: todayRules.half_day_minutes,
          full_day_minutes: todayRules.full_day_minutes,
          late_grace_minutes: todayRules.late_grace_minutes,
          configured: todayRules.configured,
        },
        actions: {
          can_check_in:
            !fullDayLeave &&
            own &&
            active &&
            workDateEligible &&
            !current &&
            todayRules.configured &&
            todayRules.end_time > todayRules.start_time,
          can_check_out:
            !fullDayLeave &&
            own &&
            active &&
            workDateEligible &&
            !!current?.check_in &&
            !current.check_out,
          checked_in_at: current ? iso(current.check_in) : null,
          checked_out_at: current ? iso(current.check_out) : null,
        },
        items,
        summary: {
          worked_minutes: items.reduce(
            (sum, row) => sum + row.worked_minutes,
            0,
          ),
          late_days: items.filter((row) => row.late_minutes > 0).length,
          absent_days: items.filter(
            (row) => row.status === 'absent' && !row.future,
          ).length,
          incomplete_days: items.filter((row) => row.status === 'incomplete')
            .length,
        },
      };
    });
  }
  validateTimes(
    checkIn: string | null | undefined,
    checkOut: string | null | undefined,
    date: string,
    rules: AttendanceRules,
    now: Date,
  ) {
    this.policy.requireSchedule(rules);
    if (!checkIn || !checkOut)
      throw new BadRequestException('Both check-in and check-out are required');
    const start = new Date(checkIn),
      end = new Date(checkOut);
    if (
      !Number.isFinite(start.getTime()) ||
      !Number.isFinite(end.getTime()) ||
      end <= start ||
      start > now ||
      end > now ||
      !sameWorkDate(start, date, rules.timezone) ||
      !sameWorkDate(end, date, rules.timezone)
    )
      throw new BadRequestException(
        'Times must be ordered, not in the future, and on the work date in the recorded company timezone',
      );
    return { start, end };
  }
  async saveDay(
    manager: EntityManager,
    actor: Principal,
    employee: AttendanceEmployee,
    date: string,
    rules: AttendanceRules,
    start: Date | null,
    end: Date | null,
    source: string,
    reason?: string,
    forcedStatus?: string,
    action = source,
  ) {
    await this.leave.checkWrite(manager,actor.tenantId!,employee.id,date,start,end);
    const previous = await this.repository.day(
      manager,
      actor.tenantId!,
      employee.id,
      date,
    );
    const calculated = start
      ? calculateAttendance(rules, start, end)
      : { status: forcedStatus!, worked_minutes: 0, late_minutes: 0 };
    const id = previous?.id ?? randomUUID();
    const values = {
      check_in: start,
      check_out: end,
      worked_minutes: calculated.worked_minutes,
      status: calculated.status,
      source,
      source_metadata: {
        rules,
        late_minutes: calculated.late_minutes,
        revision: randomUUID(),
        ...(reason ? { reason } : {}),
      },
    };
    if (previous)
      await manager
        .getRepository(Attendance)
        .update({ tenant_id: actor.tenantId, id }, values);
    else
      await manager
        .getRepository(Attendance)
        .insert({
          id,
          tenant_id: actor.tenantId,
          employee_id: employee.id,
          work_date: date,
          ...values,
        });
    const saved = await this.repository.day(
      manager,
      actor.tenantId!,
      employee.id,
      date,
    );
    await this.audit(manager, actor, id, `attendance.${action}`, {
      employee_id: employee.id,
      work_date: date,
      reason: reason ?? null,
      before: attendanceBaseline(previous),
      after: attendanceBaseline(saved),
      rules,
    });
    return {
      id,
      work_date: date,
      status: calculated.status,
      worked_minutes: calculated.worked_minutes,
    };
  }
  check(actor: Principal, checkout: boolean) {
    return this.write(actor, async (manager, timezone, now) => {
      const employee = await this.policy.self(manager, actor);
      this.policy.requireActive(employee);
      const date = companyToday(timezone, now);
      await this.policy.writableDate(
        manager,
        actor.tenantId!,
        employee,
        date,
        timezone,
        now,
      );
      const current = await this.repository.day(
        manager,
        actor.tenantId!,
        employee.id,
        date,
      );
      if (!checkout && current)
        throw new ConflictException(
          'Attendance already exists for today. Request a correction if needed.',
        );
      if (checkout && (!current?.check_in || current.check_out))
        throw new ConflictException(
          'No open check-in for today. Use a correction for a previous work date.',
        );
      const rules =
        current?.source_metadata?.rules ??
        (await this.policy.dayRules(
          manager,
          actor.tenantId!,
          employee,
          date,
          timezone,
        ));
      this.policy.requireSchedule(rules);
      if (!sameWorkDate(now, date, rules.timezone))
        throw new ConflictException(
          'Company timezone changed during this session. Submit an attendance correction.',
        );
      if (checkout && new Date(current!.check_in!) > now)
        throw new ConflictException('Check-out must follow check-in');
      return this.saveDay(
        manager,
        actor,
        employee,
        date,
        rules,
        checkout ? new Date(current!.check_in!) : now,
        checkout ? now : null,
        'web',
        undefined,
        undefined,
        checkout ? 'check_out' : 'check_in',
      );
    });
  }
  adjust(
    actor: Principal,
    employeeId: string,
    date: string,
    dto: AttendanceAdjustmentDto,
  ) {
    return this.write(actor, async (manager, timezone, now) => {
      const employee = await this.policy.accessible(manager, actor, employeeId);
      const current = await this.repository.day(
        manager,
        actor.tenantId!,
        employeeId,
        date,
      );
      const rules =
        current?.source_metadata?.rules ??
        (await this.policy.dayRules(
          manager,
          actor.tenantId!,
          employee,
          date,
          timezone,
        ));
      await this.policy.writableDate(
        manager,
        actor.tenantId!,
        employee,
        date,
        rules.timezone,
        now,
      );
      if (dto.mode === 'times') {
        const { start, end } = this.validateTimes(
          dto.check_in,
          dto.check_out,
          date,
          rules,
          now,
        );
        return this.saveDay(
          manager,
          actor,
          employee,
          date,
          rules,
          start,
          end,
          'manual',
          dto.reason,
        );
      }
      if (dto.check_in || dto.check_out)
        throw new BadRequestException(
          'A non-working status must not contain check-in/out times',
        );
      return this.saveDay(
        manager,
        actor,
        employee,
        date,
        rules,
        null,
        null,
        'manual',
        dto.reason,
        dto.mode,
      );
    });
  }
}

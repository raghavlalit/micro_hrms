import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { Employee } from '../employees/employee.schemas';
import { Tenant } from '../tenants/tenant.schemas';
import { WorkSchedule } from '../organization/organization.schemas';
import { PayrollRun } from '../payroll/payroll.schemas';
import { HolidayService } from '../holidays/holiday.service';
import { companyToday } from '../holidays/holiday-calendar';
import type { AttendanceEmployee, AttendanceRules } from './attendance.types';
import { weekday } from './attendance-calculation';

@Injectable()
export class AttendancePolicy {
  constructor(private readonly holidays: HolidayService) {}
  manages(actor: Principal) {
    return actor.permissions.includes('attendance.manage');
  }
  reviews(actor: Principal) {
    return (
      this.manages(actor) ||
      actor.permissions.includes('attendance.approve.team')
    );
  }
  employeeQuery(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .select([
        'employee.id AS id',
        'employee.employee_code AS employee_code',
        'employee.first_name AS first_name',
        'employee.last_name AS last_name',
        'employee.user_id AS user_id',
        'employee.manager_id AS manager_id',
        'employee.location_id AS location_id',
        'employee.work_schedule_id AS work_schedule_id',
        'employee.joining_date::text AS joining_date',
        'employee.termination_date::text AS termination_date',
        'employee.status AS status',
      ])
      .where(
        'employee.tenant_id = :tenantId AND employee.archived_at IS NULL',
        { tenantId },
      );
  }
  async self(manager: EntityManager, actor: Principal) {
    const employee = await this.employeeQuery(manager, actor.tenantId!)
      .andWhere('employee.user_id = :userId', { userId: actor.id })
      .getRawOne<AttendanceEmployee>();
    if (!employee)
      throw new NotFoundException(
        'Your account has no linked employee profile',
      );
    return employee;
  }
  async accessible(manager: EntityManager, actor: Principal, id: string) {
    const employee = await this.employeeQuery(manager, actor.tenantId!)
      .andWhere('employee.id = :id', { id })
      .getRawOne<AttendanceEmployee>();
    if (!employee) throw new NotFoundException('Employee not found');
    if (
      this.manages(actor) ||
      (employee.user_id === actor.id &&
        actor.permissions.includes('attendance.self'))
    )
      return employee;
    if (actor.permissions.includes('attendance.approve.team')) {
      const self = await this.self(manager, actor);
      if (employee.manager_id === self.id) return employee;
    }
    throw new NotFoundException('Employee not found');
  }
  async lockTenant(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Tenant)
      .createQueryBuilder('tenant')
      .where('tenant.id = :tenantId', { tenantId })
      .setLock('pessimistic_write')
      .getOneOrFail();
  }
  async writableDate(
    manager: EntityManager,
    tenantId: string,
    employee: AttendanceEmployee,
    date: string,
    timezone: string,
    now: Date,
  ) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date
    )
      throw new BadRequestException('Invalid work date');
    if (
      date > companyToday(timezone, now) ||
      date < employee.joining_date ||
      (employee.termination_date && date > employee.termination_date)
    )
      throw new BadRequestException(
        'Work date must be within employment dates and cannot be in the future',
      );
    const locked = await manager
      .getRepository(PayrollRun)
      .createQueryBuilder('run')
      .where(
        'run.tenant_id = :tenantId AND run.status = :status AND run.period_start <= :date AND run.period_end >= :date',
        { tenantId, status: 'locked', date },
      )
      .getExists();
    if (locked)
      throw new ConflictException(
        'Attendance cannot change within a locked payroll period',
      );
  }
  requireActive(employee: AttendanceEmployee) {
    if (!['active', 'on_notice'].includes(employee.status))
      throw new ForbiddenException(
        'Attendance self-service requires an active employee',
      );
  }
  async schedule(
    manager: EntityManager,
    tenantId: string,
    employee: AttendanceEmployee,
    timezone: string,
  ): Promise<AttendanceRules> {
    let schedule: Record<string, unknown> | null = null;
    if (employee.work_schedule_id)
      schedule = await manager
        .getRepository(WorkSchedule)
        .findOneBy({ tenant_id: tenantId, id: employee.work_schedule_id });
    else {
      // Never silently pick one of several schedules. Explicit assignment wins.
      const candidates = await manager
        .getRepository(WorkSchedule)
        .findBy({ tenant_id: tenantId, archived_at: IsNull() });
      const local = employee.location_id
        ? candidates.filter((row) => row.location_id === employee.location_id)
        : [];
      const applicable = local.length
        ? local
        : candidates.filter((row) => row.location_id === null);
      if (applicable.length === 1) schedule = applicable[0];
    }
    return {
      timezone,
      schedule_id: schedule ? String(schedule.id) : null,
      schedule_name: schedule ? String(schedule.name) : null,
      working_days: schedule ? (schedule.working_days as number[]) : [],
      start_time: schedule ? String(schedule.start_time) : '00:00:00',
      end_time: schedule ? String(schedule.end_time) : '00:00:00',
      late_grace_minutes: Number(schedule?.late_grace_minutes ?? 0),
      half_day_minutes: Number(schedule?.half_day_minutes ?? 240),
      full_day_minutes: Number(schedule?.full_day_minutes ?? 480),
      location_id: employee.location_id,
      holiday: false,
      weekly_off: false,
      configured: !!schedule,
    };
  }
  async dayRules(
    manager: EntityManager,
    tenantId: string,
    employee: AttendanceEmployee,
    date: string,
    timezone: string,
  ) {
    const rules = await this.schedule(manager, tenantId, employee, timezone);
    const holidays = await this.holidays.applicableDates(
      manager,
      tenantId,
      employee.location_id,
      date,
      date,
    );
    return {
      ...rules,
      holiday: holidays.has(date),
      weekly_off:
        rules.configured && !rules.working_days.includes(weekday(date)),
    };
  }
  requireSchedule(rules: AttendanceRules) {
    if (!rules.configured)
      throw new ConflictException(
        'Assign a work schedule to this employee before recording attendance',
      );
    if (rules.end_time <= rules.start_time)
      throw new ConflictException(
        'Overnight schedules are not supported in this attendance version',
      );
  }
}

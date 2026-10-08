import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { Principal } from '../auth/auth.service';
import { Employee } from '../employees/employee.schemas';
import { AttendanceRegularization } from './attendance.schemas';
import { AttendanceService } from './attendance.service';
import { attendanceBaseline } from './attendance-calculation';
import type { AttendanceRules } from './attendance.types';
import {
  AttendanceReviewDto,
  RegularizationDto,
  RegularizationListDto,
} from './attendance.dto';

@Injectable()
export class AttendanceRegularizationService {
  constructor(private readonly attendance: AttendanceService) {}
  submit(actor: Principal, dto: RegularizationDto) {
    return this.attendance.write(actor, async (manager, timezone, now) => {
      const employee = await this.attendance.policy.self(manager, actor);
      this.attendance.policy.requireActive(employee);
      const current = await this.attendance.repository.day(
        manager,
        actor.tenantId!,
        employee.id,
        dto.work_date,
      );
      const rules =
        current?.source_metadata?.rules ??
        (await this.attendance.policy.dayRules(
          manager,
          actor.tenantId!,
          employee,
          dto.work_date,
          timezone,
        ));
      await this.attendance.policy.writableDate(
        manager,
        actor.tenantId!,
        employee,
        dto.work_date,
        rules.timezone,
        now,
      );
      const { start, end } = this.attendance.validateTimes(
        dto.check_in,
        dto.check_out,
        dto.work_date,
        rules,
        now,
      );
      const id = randomUUID();
      await this.attendance.leave.checkWrite(
        manager,
        actor.tenantId!,
        employee.id,
        dto.work_date,
        start,
        end,
      );
      await manager.getRepository(AttendanceRegularization).insert({
        id,
        tenant_id: actor.tenantId,
        employee_id: employee.id,
        work_date: dto.work_date,
        requested_check_in: start,
        requested_check_out: end,
        reason: dto.reason,
        original_values: { attendance: attendanceBaseline(current), rules },
        status: 'pending',
      });
      await this.attendance.audit(
        manager,
        actor,
        id,
        'attendance.correction_requested',
        {
          employee_id: employee.id,
          work_date: dto.work_date,
          reason: dto.reason,
        },
      );
      return { id, status: 'pending' };
    });
  }
  list(actor: Principal, dto: RegularizationListDto) {
    const policy = this.attendance.policy,
      scope = dto.scope ?? (policy.reviews(actor) ? 'review' : 'mine');
    if (scope === 'review' && !policy.reviews(actor))
      throw new ForbiddenException('Attendance approval permission required');
    if (scope === 'mine' && !actor.permissions.includes('attendance.self'))
      throw new ForbiddenException(
        'Attendance self-service permission required',
      );
    return this.attendance.tenants.withTenant(
      actor.tenantId!,
      async (manager) => {
        const query = manager
          .getRepository(AttendanceRegularization)
          .createQueryBuilder('request')
          .innerJoin(
            Employee.options.name,
            'employee',
            'employee.id = request.employee_id AND employee.tenant_id = request.tenant_id',
          )
          .where('request.tenant_id = :tenantId', { tenantId: actor.tenantId });
        if (scope === 'mine')
          query.andWhere('employee.user_id = :userId', { userId: actor.id });
        else {
          query.andWhere(
            '(employee.user_id IS NULL OR employee.user_id <> :userId)',
            { userId: actor.id },
          );
          if (!policy.manages(actor))
            query.andWhere('employee.manager_id = :managerId', {
              managerId: (await policy.self(manager, actor)).id,
            });
        }
        if (dto.status)
          query.andWhere('request.status = :status', { status: dto.status });
        if (dto.search)
          query.andWhere(
            '(employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.employee_code ILIKE :search)',
            { search: `%${dto.search.replace(/[\\%_]/g, '\\$&')}%` },
          );
        const total = await query.getCount();
        const items = await query
          .select([
            'request.id AS id',
            'request.employee_id AS employee_id',
            'employee.employee_code AS employee_code',
            "concat(employee.first_name, ' ', employee.last_name) AS employee_name",
            'request.work_date::text AS work_date',
            'request.requested_check_in AS check_in',
            'request.requested_check_out AS check_out',
            'request.reason AS reason',
            'request.status AS status',
            'request.reviewed_at AS reviewed_at',
            'request.review_comment AS review_comment',
            "request.original_values->'rules'->>'timezone' AS timezone",
          ])
          .orderBy('request.created_at', 'DESC')
          .addOrderBy('request.id', 'ASC')
          .offset((dto.page - 1) * dto.limit)
          .limit(dto.limit)
          .getRawMany();
        return { items, total, scope };
      },
    );
  }
  review(actor: Principal, id: string, dto: AttendanceReviewDto) {
    if (!this.attendance.policy.reviews(actor))
      throw new ForbiddenException('Attendance approval permission required');
    return this.attendance.write(actor, async (manager, timezone, now) => {
      const request = await manager
        .getRepository(AttendanceRegularization)
        .findOneBy({ tenant_id: actor.tenantId, id });
      if (!request) throw new NotFoundException('Correction request not found');
      const employee = await this.attendance.policy.accessible(
        manager,
        actor,
        String(request.employee_id),
      );
      if (employee.user_id === actor.id)
        throw new ForbiddenException(
          'Another authorized reviewer must review your correction',
        );
      if (request.status !== 'pending')
        throw new ConflictException(
          'This correction has already been reviewed',
        );
      if (dto.decision === 'approved') {
        const date = String(request.work_date);
        const original = request.original_values as {
          attendance: ReturnType<typeof attendanceBaseline>;
          rules?: AttendanceRules;
        };
        const current = await this.attendance.repository.day(
          manager,
          actor.tenantId!,
          employee.id,
          date,
        );
        if (
          !isDeepStrictEqual(original.attendance, attendanceBaseline(current))
        )
          throw new ConflictException(
            'Attendance changed after this request. Reject it and ask for a fresh correction.',
          );
        const rules =
          original.rules ??
          (await this.attendance.policy.dayRules(
            manager,
            actor.tenantId!,
            employee,
            date,
            timezone,
          ));
        await this.attendance.policy.writableDate(
          manager,
          actor.tenantId!,
          employee,
          date,
          rules.timezone,
          now,
        );
        const { start, end } = this.attendance.validateTimes(
          new Date(request.requested_check_in as Date).toISOString(),
          new Date(request.requested_check_out as Date).toISOString(),
          date,
          rules,
          now,
        );
        await this.attendance.saveDay(
          manager,
          actor,
          employee,
          date,
          rules,
          start,
          end,
          'regularization',
          String(request.reason),
        );
      }
      await manager.getRepository(AttendanceRegularization).update(
        { tenant_id: actor.tenantId, id },
        {
          status: dto.decision,
          reviewer_id: actor.id,
          reviewed_at: now,
          review_comment: dto.comment ?? null,
        },
      );
      await this.attendance.audit(
        manager,
        actor,
        id,
        `attendance.correction_${dto.decision}`,
        {
          employee_id: employee.id,
          work_date: request.work_date,
          comment: dto.comment ?? null,
        },
      );
      return { id, status: dto.decision };
    });
  }
}

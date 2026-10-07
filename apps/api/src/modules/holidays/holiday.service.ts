import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, IsNull, QueryFailedError } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { Tenant } from '../tenants/tenant.schemas';
import { Location } from '../organization/organization.schemas';
import { Employee } from '../employees/employee.schemas';
import { AuditLog } from '../audit/audit.schemas';
import { Holiday } from './holiday.schemas';
import { HolidayCalendarDto, HolidayDto } from './holiday.dto';
import { companyToday, uniqueHolidayDates } from './holiday-calendar';
import type { CalendarHoliday } from './holiday-calendar';

@Injectable()
export class HolidayService {
  constructor(private readonly tenants: TenantDatabaseService) {}

  private query(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Holiday)
      .createQueryBuilder('holiday')
      .leftJoin(
        Location.options.name,
        'location',
        'location.id = holiday.location_id AND location.tenant_id = holiday.tenant_id',
      )
      .select([
        'holiday.id AS id',
        'holiday.name AS name',
        'holiday.holiday_date::text AS holiday_date',
        'holiday.description AS description',
        'holiday.location_id AS location_id',
        'location.name AS location_name',
      ])
      .where('holiday.tenant_id = :tenantId', { tenantId })
      .orderBy('holiday.holiday_date', 'ASC')
      .addOrderBy('holiday.name', 'ASC')
      .addOrderBy('holiday.id', 'ASC');
  }

  // Existing admin list contract stays an array, including previous years.
  list(actor: Principal) {
    return this.tenants.withTenant(actor.tenantId!, (manager) =>
      this.query(manager, actor.tenantId!).getRawMany<CalendarHoliday>(),
    );
  }

  calendar(actor: Principal, dto: HolidayCalendarDto) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const tenant = await manager
        .getRepository(Tenant)
        .findOneByOrFail({ id: actor.tenantId });
      const timezone = String(tenant.timezone);
      const today = companyToday(timezone);
      const year = dto.year ?? Number(today.slice(0, 4));
      const canManage = actor.permissions.includes('company.manage');
      const scope = dto.scope ?? (canManage ? 'all' : 'mine');
      if (!canManage && (scope !== 'mine' || dto.location_id))
        throw new ForbiddenException(
          'Employees can only view their applicable holiday calendar',
        );
      if ((scope === 'location') !== !!dto.location_id)
        throw new BadRequestException(
          'Provide location_id only with location scope',
        );
      let locationId: string | null = null;
      let locationName: string | null = null;
      let linkedEmployee = false;
      if (scope === 'mine') {
        const employee = await manager
          .getRepository(Employee)
          .findOne({
            select: { id: true, location_id: true },
            where: {
              tenant_id: actor.tenantId,
              user_id: actor.id,
              archived_at: IsNull(),
            },
          });
        linkedEmployee = !!employee;
        locationId =
          typeof employee?.location_id === 'string'
            ? employee.location_id
            : null;
      } else if (scope === 'location') locationId = dto.location_id!;
      if (locationId) {
        const location = await manager
          .getRepository(Location)
          .findOneBy({ tenant_id: actor.tenantId, id: locationId });
        if (!location) throw new NotFoundException('Location not found');
        locationName = String(location.name);
      }
      const query = this.query(manager, actor.tenantId!).andWhere(
        'holiday.holiday_date >= :start AND holiday.holiday_date < :end',
        { start: `${year}-01-01`, end: `${year + 1}-01-01` },
      );
      if (scope !== 'all') {
        if (locationId)
          query.andWhere(
            '(holiday.location_id IS NULL OR holiday.location_id = :locationId)',
            { locationId },
          );
        else query.andWhere('holiday.location_id IS NULL');
      }
      const items = await query.getRawMany<CalendarHoliday>();
      // Archived locations remain available for historical review, but not new assignments.
      const locations = canManage
        ? await manager
            .getRepository(Location)
            .find({
              select: { id: true, name: true, archived_at: true },
              where: { tenant_id: actor.tenantId },
              order: { name: 'ASC' },
            })
        : [];
      const dates = [...uniqueHolidayDates(items)].sort();
      return {
        year,
        timezone,
        today,
        scope,
        location_id: locationId,
        location_name: locationName,
        linked_employee: linkedEmployee,
        can_manage: canManage,
        locations,
        items,
        summary: {
          dates: dates.length,
          upcoming_dates: dates.filter((date) => date >= today).length,
          next_date: dates.find((date) => date >= today) ?? null,
        },
      };
    });
  }

  /** For attendance/leave callers already using a trusted tenant transaction.
   * Includes company-wide + this location only; end date is inclusive.
   * Weekends remain the caller's work-schedule/policy concern.
   */
  async applicableDates(
    manager: EntityManager,
    tenantId: string,
    locationId: string | null,
    from: string,
    to: string,
  ): Promise<Set<string>> {
    const query = this.query(manager, tenantId).andWhere(
      'holiday.holiday_date BETWEEN :from AND :to',
      { from, to },
    );
    if (locationId)
      query.andWhere(
        '(holiday.location_id IS NULL OR holiday.location_id = :locationId)',
        { locationId },
      );
    else query.andWhere('holiday.location_id IS NULL');
    return uniqueHolidayDates(await query.getRawMany<CalendarHoliday>());
  }

  async save(actor: Principal, dto: HolidayDto, id?: string) {
    if (!actor.permissions.includes('company.manage'))
      throw new ForbiddenException('Company management permission required');
    try {
      return await this.tenants.withTenant(actor.tenantId!, async (manager) => {
        // Serialize company-wide/location conflict checks, including concurrent writes.
        await manager
          .getRepository(Tenant)
          .createQueryBuilder('tenant')
          .where('tenant.id = :id', { id: actor.tenantId })
          .setLock('pessimistic_write')
          .getOneOrFail();
        const repository = manager.getRepository(Holiday);
        const previous = id
          ? await repository.findOneBy({ tenant_id: actor.tenantId, id })
          : null;
        if (id && !previous) throw new NotFoundException('Holiday not found');
        const locationId = dto.location_id ?? null;
        if (locationId) {
          const location = await manager
            .getRepository(Location)
            .findOneBy({ tenant_id: actor.tenantId, id: locationId });
          if (
            !location ||
            (location.archived_at && previous?.location_id !== locationId)
          )
            throw new BadRequestException(
              'Choose an available location in this company',
            );
        }
        const overlap = repository
          .createQueryBuilder('holiday')
          .where(
            'holiday.tenant_id = :tenantId AND holiday.holiday_date = :date',
            { tenantId: actor.tenantId, date: dto.holiday_date },
          );
        if (id) overlap.andWhere('holiday.id <> :id', { id });
        // Different locations may share a date. A company-wide date already covers every location.
        if (locationId)
          overlap.andWhere(
            '(holiday.location_id IS NULL OR holiday.location_id = :locationId)',
            { locationId },
          );
        if (await overlap.getExists())
          throw new ConflictException(
            'A holiday already covers this date for the selected location or company',
          );
        const values = {
          name: dto.name,
          holiday_date: dto.holiday_date,
          location_id: locationId,
          description: dto.description ?? null,
        };
        let holidayId = id;
        if (id)
          await repository.update({ tenant_id: actor.tenantId, id }, values);
        else {
          const result = await repository.insert({
            tenant_id: actor.tenantId,
            ...values,
          });
          holidayId = String(result.identifiers[0].id);
        }
        await manager
          .getRepository(AuditLog)
          .insert({
            tenant_id: actor.tenantId,
            actor_id: actor.id,
            action: id ? 'holiday.updated' : 'holiday.created',
            entity_type: 'holiday',
            entity_id: holidayId,
            metadata: {
              before: previous
                ? {
                    name: previous.name,
                    holiday_date: previous.holiday_date,
                    location_id: previous.location_id,
                    description: previous.description,
                  }
                : null,
              after: values,
            },
          });
        return this.query(manager, actor.tenantId!)
          .andWhere('holiday.id = :id', { id: holidayId })
          .getRawOne<CalendarHoliday>();
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'A holiday already exists for this date and location',
        );
      throw error;
    }
  }
}

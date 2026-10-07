import { Injectable } from '@nestjs/common';
import { Brackets, EntityManager } from 'typeorm';
import { Employee } from './employee.schemas';
import { EmployeeListDto } from './employee.dto';
import {
  Department,
  Designation,
  Location,
  WorkSchedule,
} from '../organization/organization.schemas';
import type { EmployeeRecord } from './employee-record';
import { User } from '../users/user.schemas';

@Injectable()
export class EmployeeRepository {
  query(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .where('employee.tenant_id = :tenantId', { tenantId })
      .andWhere('employee.archived_at IS NULL');
  }
  profileQuery(manager: EntityManager, tenantId: string) {
    return this.query(manager, tenantId)
      .select('employee.*')
      .addSelect('employee.joining_date::text', 'joining_date')
      .addSelect('employee.date_of_birth::text', 'date_of_birth')
      .addSelect('employee.probation_ends_on::text', 'probation_ends_on')
      .addSelect('employee.notice_date::text', 'notice_date')
      .addSelect('employee.termination_date::text', 'termination_date')
      .leftJoin(
        User.options.name,
        'account',
        'account.id = employee.user_id AND account.tenant_id = employee.tenant_id',
      )
      .addSelect('account.status', 'account_status')
      .leftJoin(
        Department.options.name,
        'department',
        'department.id = employee.department_id AND department.tenant_id = employee.tenant_id',
      )
      .leftJoin(
        Designation.options.name,
        'designation',
        'designation.id = employee.designation_id AND designation.tenant_id = employee.tenant_id',
      )
      .leftJoin(
        Location.options.name,
        'location',
        'location.id = employee.location_id AND location.tenant_id = employee.tenant_id',
      )
      .leftJoin(
        WorkSchedule.options.name,
        'schedule',
        'schedule.id = employee.work_schedule_id AND schedule.tenant_id = employee.tenant_id',
      )
      .leftJoin(
        Employee.options.name,
        'boss',
        'boss.id = employee.manager_id AND boss.tenant_id = employee.tenant_id',
      )
      .addSelect('department.name', 'department_name')
      .addSelect('designation.name', 'designation_name')
      .addSelect('location.name', 'location_name')
      .addSelect('schedule.name', 'work_schedule_name')
      .addSelect(
        "concat_ws(' ', boss.first_name, boss.last_name)",
        'manager_name',
      );
  }
  async list(
    manager: EntityManager,
    tenantId: string,
    dto: EmployeeListDto,
    scope: { all: boolean; selfId?: string; self: boolean; team: boolean },
  ) {
    const query = this.profileQuery(manager, tenantId);
    if (!scope.all) {
      query.andWhere(
        new Brackets((where) => {
          where.where('1 = 0');
          if (scope.selfId && scope.self)
            where.orWhere('employee.id = :selfId', { selfId: scope.selfId });
          if (scope.selfId && scope.team)
            where.orWhere('employee.manager_id = :selfId', {
              selfId: scope.selfId,
            });
        }),
      );
    }
    if (dto.search.trim())
      query.andWhere(
        "concat_ws(' ', employee.first_name, employee.last_name, employee.employee_code, employee.email) ILIKE :search ESCAPE '\\'",
        { search: `%${dto.search.trim().replace(/[\\%_]/g, '\\$&')}%` },
      );
    for (const key of [
      'status',
      'department_id',
      'designation_id',
      'location_id',
      'manager_id',
    ] as const) {
      if (dto[key])
        query.andWhere(`employee.${key} = :${key}`, { [key]: dto[key] });
    }
    const total = await query.getCount();
    const items = await query
      .orderBy('employee.first_name', 'ASC')
      .addOrderBy('employee.last_name', 'ASC')
      .addOrderBy('employee.id', 'ASC')
      .offset((dto.page - 1) * dto.limit)
      .limit(dto.limit)
      .getRawMany<EmployeeRecord>();
    return { items, total, page: dto.page, limit: dto.limit };
  }
  find(manager: EntityManager, tenantId: string, id: string) {
    return this.profileQuery(manager, tenantId)
      .andWhere('employee.id = :id', { id })
      .getRawOne<EmployeeRecord>();
  }
  findSelf(manager: EntityManager, tenantId: string, userId: string) {
    return this.query(manager, tenantId)
      .andWhere('employee.user_id = :userId', { userId })
      .getOne();
  }
}

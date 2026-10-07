import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Attendance } from './attendance.schemas';
import type { AttendanceRow } from './attendance.types';
@Injectable()
export class AttendanceRepository {
  query(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Attendance)
      .createQueryBuilder('attendance')
      .select('attendance.*')
      .addSelect('attendance.work_date::text', 'work_date')
      .where('attendance.tenant_id = :tenantId', { tenantId });
  }
  async day(
    manager: EntityManager,
    tenantId: string,
    employeeId: string,
    date: string,
  ) {
    return (
      (await this.query(manager, tenantId)
        .andWhere(
          'attendance.employee_id = :employeeId AND attendance.work_date = :date',
          { employeeId, date },
        )
        .getRawOne<AttendanceRow>()) ?? null
    );
  }
  month(
    manager: EntityManager,
    tenantId: string,
    employeeId: string,
    from: string,
    to: string,
  ) {
    return this.query(manager, tenantId)
      .andWhere(
        'attendance.employee_id = :employeeId AND attendance.work_date BETWEEN :from AND :to',
        { employeeId, from, to },
      )
      .orderBy('attendance.work_date', 'ASC')
      .getRawMany<AttendanceRow>();
  }
}

import { Injectable, Module } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AttendanceRegularization } from './attendance.schemas';
@Injectable()
export class AttendancePayrollService {
  pending(manager: EntityManager, tenantId: string, from: string, to: string) {
    return manager
      .getRepository(AttendanceRegularization)
      .createQueryBuilder('request')
      .where(
        'request.tenant_id = :tenantId AND request.work_date BETWEEN :from AND :to AND request.status = :status',
        { tenantId, from, to, status: 'pending' },
      )
      .getCount();
  }
}
@Module({
  providers: [AttendancePayrollService],
  exports: [AttendancePayrollService],
})
export class AttendancePayrollModule {}

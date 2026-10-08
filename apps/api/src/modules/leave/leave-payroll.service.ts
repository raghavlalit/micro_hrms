import { ConflictException, Injectable, Module } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { LeaveRequest } from './leave.schemas';
import type { LeaveCalculation } from './leave-calculation';
@Injectable()
export class LeavePayrollService {
  async period(
    manager: EntityManager,
    tenantId: string,
    from: string,
    to: string,
  ) {
    const rows = await manager
      .getRepository(LeaveRequest)
      .createQueryBuilder('request')
      .where(
        'request.tenant_id = :tenantId AND request.start_date <= :to AND request.end_date >= :from AND request.status IN (:...states)',
        { tenantId, from, to, states: ['pending', 'approved'] },
      )
      .orderBy('request.id', 'ASC')
      .getMany();
    return {
      pending: rows.filter((row) => row.status === 'pending').length,
      unpaid: rows
        .filter((row) => row.status === 'approved')
        .flatMap((row) => {
          const snapshot = row.calculation as Partial<LeaveCalculation>;
          if (!snapshot.days || typeof snapshot.is_paid !== 'boolean')
            throw new ConflictException(
              'Approved legacy leave needs reconciliation before payroll calculation',
            );
          return snapshot.is_paid
            ? []
            : snapshot.days
                .filter((day) => day.date >= from && day.date <= to)
                .map((day) => ({
                  employee_id: String(row.employee_id),
                  request_id: String(row.id),
                  date: day.date,
                  half_units: day.units * 2,
                }));
        }),
    };
  }
}
@Module({ providers: [LeavePayrollService], exports: [LeavePayrollService] })
export class LeavePayrollModule {}

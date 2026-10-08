import { Injectable, Module } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Employee } from './employee.schemas';
export interface PayrollPerson {
  id: string;
  user_id: string | null;
  employee_code: string;
  first_name: string;
  last_name: string;
  joining_date: string;
  termination_date: string | null;
  status: string;
}
@Injectable()
export class EmployeePayrollService {
  query(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .select([
        'employee.id AS id',
        'employee.user_id AS user_id',
        'employee.employee_code AS employee_code',
        'employee.first_name AS first_name',
        'employee.last_name AS last_name',
        'employee.joining_date::text AS joining_date',
        'employee.termination_date::text AS termination_date',
        'employee.status AS status',
      ])
      .where(
        'employee.tenant_id = :tenantId AND employee.archived_at IS NULL',
        { tenantId },
      );
  }
  period(manager: EntityManager, tenantId: string, from: string, to: string) {
    return this.query(manager, tenantId)
      .andWhere(
        'employee.joining_date <= :to AND (employee.termination_date IS NULL OR employee.termination_date >= :from)',
        { from, to },
      )
      .orderBy('employee.id', 'ASC')
      .getRawMany<PayrollPerson>();
  }
  one(manager: EntityManager, tenantId: string, id: string) {
    return this.query(manager, tenantId)
      .andWhere('employee.id = :id', { id })
      .getRawOne<PayrollPerson>();
  }
}
@Module({
  providers: [EmployeePayrollService],
  exports: [EmployeePayrollService],
})
export class EmployeePayrollModule {}

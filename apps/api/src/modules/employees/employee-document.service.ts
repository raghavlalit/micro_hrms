import { Injectable, Module } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { Employee } from './employee.schemas';
/** Small read contract for document ownership and employee selection; no private fields. */
@Injectable()
export class EmployeeDocumentService {
  private query(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .select([
        'employee.id AS id',
        'employee.user_id AS user_id',
        'employee.employee_code AS employee_code',
        "concat(employee.first_name, ' ', employee.last_name) AS name",
      ])
      .where('employee.tenant_id = :tenantId', { tenantId });
  }
  one(manager: EntityManager, tenantId: string, id: string) {
    return this.query(manager, tenantId)
      .andWhere('employee.id = :id', { id })
      .getRawOne<{
        id: string;
        user_id: string | null;
        employee_code: string;
        name: string;
      }>();
  }
  linked(manager: EntityManager, tenantId: string, userId: string) {
    return this.query(manager, tenantId)
      .andWhere('employee.user_id = :userId', { userId })
      .getRawOne<{ id: string }>();
  }
  assignable(manager: EntityManager, tenantId: string, id: string) {
    return manager
      .getRepository(Employee)
      .existsBy({ tenant_id: tenantId, id, archived_at: IsNull() });
  }
  async people(
    manager: EntityManager,
    tenantId: string,
    search: string | undefined,
    page: number,
    limit: number,
  ) {
    const query = this.query(manager, tenantId).andWhere(
      'employee.archived_at IS NULL',
    );
    if (search)
      query.andWhere(
        '(employee.first_name ILIKE :search OR employee.last_name ILIKE :search OR employee.employee_code ILIKE :search)',
        { search: `%${search.replace(/[\\%_]/g, '\\$&')}%` },
      );
    const total = await query.getCount();
    const items = await query
      .orderBy('employee.first_name', 'ASC')
      .addOrderBy('employee.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getRawMany<{ id: string; name: string; employee_code: string }>();
    return {
      items: items.map(({ id, name, employee_code }) => ({
        id,
        name,
        employee_code,
      })),
      total,
    };
  }
}
@Module({
  providers: [EmployeeDocumentService],
  exports: [EmployeeDocumentService],
})
export class EmployeeDocumentsModule {}

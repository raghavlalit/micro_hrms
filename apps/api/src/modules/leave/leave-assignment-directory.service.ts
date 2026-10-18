import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntityManager, IsNull } from 'typeorm';
import { Department, Location } from '../organization/organization.schemas';
import type { Principal } from '../auth/auth.service';
import { Employee } from '../employees/employee.schemas';
import { LeaveAccess } from './leave-access.service';
import { LeavePolicy, LeaveType, LeaveBalance } from './leave.schemas';
import { LeaveAssignmentFilterDto } from './leave-assignment.dto';

@Injectable()
export class LeaveAssignmentDirectory {
  constructor(readonly access: LeaveAccess) {}
  requireManage(actor: Principal) {
    if (!this.access.manages(actor))
      throw new ForbiddenException('Leave management access required');
  }
  lookup(actor: Principal, kind: 'departments' | 'locations') {
    this.requireManage(actor);
    return this.access.tenants.withTenant(actor.tenantId!, (manager) =>
      manager
        .getRepository(kind === 'departments' ? Department : Location)
        .find({
          select: { id: true, name: true },
          where: { tenant_id: actor.tenantId, archived_at: IsNull() },
          order: { name: 'ASC' },
        }),
    );
  }
  // A leave type counts once, even when several policies offer it. Scope and
  // employment dates determine applicability; zero remaining balance is still assigned.
  private applicablePolicies(manager: EntityManager) {
    return manager
      .getRepository(LeavePolicy)
      .createQueryBuilder('policy')
      .innerJoin(
        LeaveType.options.name,
        'type',
        'type.id=policy.leave_type_id AND type.tenant_id=policy.tenant_id AND type.is_active=true',
      )
      .where(
        'policy.tenant_id=employee.tenant_id AND policy.archived_at IS NULL',
      )
      .andWhere(
        'policy.effective_from <= LEAST(:yearEnd, COALESCE(employee.termination_date, :yearEnd))',
      )
      .andWhere(
        'COALESCE(policy.effective_to, :yearEnd) >= GREATEST(:yearStart, employee.joining_date)',
      )
      .andWhere(
        "(policy.applicability->>'department_id' IS NULL OR policy.applicability->>'department_id'=employee.department_id::text)",
      )
      .andWhere(
        "(policy.applicability->>'location_id' IS NULL OR policy.applicability->>'location_id'=employee.location_id::text)",
      );
  }
  options(actor: Principal, employeeId: string, year: number) {
    this.requireManage(actor);
    return this.access.tenants.withTenant(actor.tenantId!, async (manager) => {
      await this.access.employee(manager, actor, employeeId);
      return this.applicablePolicies(manager)
        .innerJoin(
          Employee.options.name,
          'employee',
          'employee.tenant_id=policy.tenant_id AND employee.id=:employeeId',
        )
        .leftJoin(
          LeaveBalance.options.name,
          'balance',
          'balance.tenant_id=employee.tenant_id AND balance.employee_id=employee.id AND balance.leave_type_id=policy.leave_type_id AND balance.period_start=:yearStart',
        )
        .andWhere('policy.tenant_id=:tenantId AND balance.id IS NULL')
        .andWhere(
          "employee.status IN ('active','on_notice') AND employee.joining_date<=:yearEnd AND (employee.termination_date IS NULL OR employee.termination_date>=:yearStart)",
        )
        .setParameters({
          employeeId,
          tenantId: actor.tenantId,
          yearStart: `${year}-01-01`,
          yearEnd: `${year}-12-31`,
        })
        .orderBy('policy.name', 'ASC')
        .getMany();
    });
  }
  query(
    manager: EntityManager,
    actor: Principal,
    filters: LeaveAssignmentFilterDto,
  ) {
    const policy = this.applicablePolicies(manager);
    if (filters.policy_id) policy.andWhere('policy.id=:policyId');
    const expected = policy
      .clone()
      .select('COUNT(DISTINCT policy.leave_type_id)')
      .getQuery();
    const assigned = policy
      .clone()
      .innerJoin(
        LeaveBalance.options.name,
        'balance',
        'balance.tenant_id=employee.tenant_id AND balance.employee_id=employee.id AND balance.leave_type_id=policy.leave_type_id AND balance.period_start=:yearStart',
      )
      .select('COUNT(DISTINCT policy.leave_type_id)')
      .getQuery();
    const status = `CASE WHEN (${expected})=0 THEN 'not_applicable' WHEN (${assigned})=(${expected}) THEN 'assigned' WHEN (${assigned})>0 THEN 'partial' ELSE 'unassigned' END`;
    const query = manager
      .getRepository(Employee)
      .createQueryBuilder('employee')
      .where('employee.tenant_id=:tenantId AND employee.archived_at IS NULL', {
        tenantId: actor.tenantId,
      })
      .andWhere('employee.status IN (:...statuses)', {
        statuses: ['active', 'on_notice'],
      })
      .andWhere(
        'employee.joining_date<=:yearEnd AND (employee.termination_date IS NULL OR employee.termination_date>=:yearStart)',
      )
      .setParameters({
        yearStart: `${filters.year}-01-01`,
        yearEnd: `${filters.year}-12-31`,
        policyId: filters.policy_id,
      });
    if (filters.search)
      query.andWhere(
        "(concat(employee.first_name, ' ', employee.last_name) ILIKE :search OR employee.employee_code ILIKE :search)",
        { search: `%${filters.search.replace(/[\\%_]/g, '\\$&')}%` },
      );
    if (filters.department_id)
      query.andWhere('employee.department_id=:departmentId', {
        departmentId: filters.department_id,
      });
    if (filters.location_id)
      query.andWhere('employee.location_id=:locationId', {
        locationId: filters.location_id,
      });
    return { query, expected, assigned, status };
  }
  matching(
    manager: EntityManager,
    actor: Principal,
    filters: LeaveAssignmentFilterDto,
  ) {
    const model = this.query(manager, actor, filters);
    if (filters.status)
      model.query.andWhere(`${model.status}=:assignmentStatus`, {
        assignmentStatus: filters.status,
      });
    return model;
  }
  list(actor: Principal, filters: LeaveAssignmentFilterDto) {
    this.requireManage(actor);
    return this.access.tenants.withTenant(actor.tenantId!, async (manager) => {
      const base = this.query(manager, actor, filters);
      const counts = await base.query
        .clone()
        .select(base.status, 'status')
        .addSelect('COUNT(*)', 'count')
        .groupBy(base.status)
        .getRawMany();
      const summary: Record<string, number> = {
        assigned: 0,
        partial: 0,
        unassigned: 0,
        not_applicable: 0,
        total: 0,
      };
      for (const row of counts) {
        summary[row.status] = Number(row.count);
        summary.total += Number(row.count);
      }
      const { query, expected, assigned, status } = this.matching(
        manager,
        actor,
        filters,
      );
      const total = filters.status ? summary[filters.status] : summary.total;
      const items = await query
        .select([
          'employee.id AS id',
          "concat(employee.first_name, ' ', employee.last_name) AS name",
          'employee.employee_code AS employee_code',
        ])
        .addSelect(`(${expected})`, 'expected')
        .addSelect(`(${assigned})`, 'assigned')
        .addSelect(status, 'status')
        .orderBy('employee.first_name', 'ASC')
        .addOrderBy('employee.id', 'ASC')
        .offset((filters.page - 1) * filters.limit)
        .limit(filters.limit)
        .getRawMany();
      return {
        items: items.map((row) => ({
          ...row,
          expected: Number(row.expected),
          assigned: Number(row.assigned),
        })),
        total,
        summary,
      };
    });
  }
}

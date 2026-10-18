import { ForbiddenException, Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import type { ReportKind } from './report.dto';
export interface ReportScope {
  level: 'company' | 'team' | 'self';
  employeeId?: string;
}
@Injectable()
export class ReportAccess {
  scope(
    actor: Principal,
    kind: ReportKind,
    report = true,
  ): ReportScope['level'] | null {
    const has = (permission: string) => actor.permissions.includes(permission);
    const company = !report || has('reports.read.company'),
      team = !report || has('reports.read.team') || has('reports.read.company');
    if (kind === 'payroll' || kind === 'components')
      return company && has('payroll.manage') ? 'company' : null;
    const permissions = {
      employees: [
        'employees.manage',
        'employees.read.team',
        'employees.read.self',
      ],
      attendance: [
        'attendance.manage',
        'attendance.approve.team',
        'attendance.self',
      ],
      leave: ['leave.manage', 'leave.approve.team', 'leave.self'],
      balances: ['leave.manage', 'leave.approve.team', 'leave.self'],
    }[kind];
    if (company && has(permissions[0])) return 'company';
    if (team && has(permissions[1])) return 'team';
    if (!report && has(permissions[2])) return 'self';
    return null;
  }
  async resolve(
    manager: EntityManager,
    actor: Principal,
    kind: ReportKind,
    report = true,
  ): Promise<ReportScope> {
    const level = this.scope(actor, kind, report);
    if (!level)
      throw new ForbiddenException(
        'Report and matching domain permissions are required',
      );
    if (level === 'company') return { level };
    // Deliberate reporting read model: identity only, never private employee fields.
    const employee = await manager
      .createQueryBuilder()
      .from('employees', 'employee')
      .select('employee.id', 'id')
      .where(
        'employee.tenant_id = :tenantId AND employee.user_id = :userId AND employee.archived_at IS NULL',
        { tenantId: actor.tenantId, userId: actor.id },
      )
      .getRawOne<{ id: string }>();
    return { level, employeeId: employee?.id };
  }
  apply(
    query: ReturnType<EntityManager['createQueryBuilder']>,
    scope: ReportScope,
  ) {
    if (scope.level !== 'company') {
      if (!scope.employeeId) query.andWhere('1 = 0');
      else
        query.andWhere(
          scope.level === 'team'
            ? 'employee.manager_id = :scopeId'
            : 'employee.id = :scopeId',
          { scopeId: scope.employeeId },
        );
    }
    return query;
  }
}

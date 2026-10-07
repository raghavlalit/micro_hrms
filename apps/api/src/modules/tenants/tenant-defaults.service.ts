import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { MASTER_DATA_SEED } from './seeds/master-data.seed';
import { Role, RolePermission } from '../users/user.schemas';
import {
  Department,
  Designation,
  Location,
  WorkSchedule,
} from '../organization/organization.schemas';
import { LeaveType } from '../leave/leave.schemas';
import { SalaryComponent } from '../payroll/payroll.schemas';
import { DocumentCategory } from '../documents/document.schemas';

@Injectable()
export class TenantDefaultsService {
  // New companies only. Never rerun this against an existing company's customized records.
  async create(manager: EntityManager, tenantId: string): Promise<string> {
    let adminRoleId = '';
    for (const role of MASTER_DATA_SEED.roles) {
      const result = await manager
        .getRepository(Role)
        .insert({ tenant_id: tenantId, code: role.code, name: role.name });
      const roleId = String(result.identifiers[0].id);
      if (role.code === 'company_admin') adminRoleId = roleId;
      await manager.getRepository(RolePermission).insert(
        role.permission_codes.map((permission_code) => ({
          tenant_id: tenantId,
          role_id: roleId,
          permission_code,
        })),
      );
    }
    await manager
      .getRepository(Department)
      .insert(
        MASTER_DATA_SEED.departments.map((row) => ({
          ...row,
          tenant_id: tenantId,
        })),
      );
    await manager
      .getRepository(Designation)
      .insert(
        MASTER_DATA_SEED.designations.map((row) => ({
          ...row,
          tenant_id: tenantId,
        })),
      );
    const locations = new Map<string, string>();
    for (const location of MASTER_DATA_SEED.locations) {
      const result = await manager
        .getRepository(Location)
        .insert({ ...location, tenant_id: tenantId });
      locations.set(location.code, String(result.identifiers[0].id));
    }
    for (const schedule of MASTER_DATA_SEED.work_schedules) {
      const { location_code, ...values } = schedule;
      await manager.getRepository(WorkSchedule).insert({
        ...values,
        working_days: [...values.working_days],
        tenant_id: tenantId,
        location_id: locations.get(location_code),
      });
    }
    await manager
      .getRepository(LeaveType)
      .insert(
        MASTER_DATA_SEED.leave_types.map((row) => ({
          ...row,
          tenant_id: tenantId,
        })),
      );
    await manager
      .getRepository(SalaryComponent)
      .insert(
        MASTER_DATA_SEED.salary_components.map((row) => ({
          ...row,
          tenant_id: tenantId,
        })),
      );
    await manager
      .getRepository(DocumentCategory)
      .insert(
        MASTER_DATA_SEED.document_categories.map((row) => ({
          ...row,
          tenant_id: tenantId,
        })),
      );
    return adminRoleId;
  }
}

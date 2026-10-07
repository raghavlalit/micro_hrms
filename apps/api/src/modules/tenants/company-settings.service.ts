import { Injectable } from '@nestjs/common';
import { TenantDatabaseService } from './tenant-database.service';
import { Tenant } from './tenant.schemas';
import { CompanyProfileDto } from './company.dto';
import { companyFields, companyProfile } from './company-profile';
import { AuditLog } from '../audit/audit.schemas';

@Injectable()
export class CompanySettingsService {
  constructor(private readonly tenants: TenantDatabaseService) {}
  get(tenantId: string) {
    return this.tenants.withTenant(tenantId, (manager) =>
      manager
        .getRepository(Tenant)
        .createQueryBuilder('company')
        .select(companyFields.map((field) => `company.${field} AS ${field}`))
        .where('company.id = :tenantId', { tenantId })
        .getRawOne(),
    );
  }
  async update(tenantId: string, actorId: string, dto: CompanyProfileDto) {
    const values = companyProfile(dto);
    await this.tenants.withTenant(tenantId, async (manager) => {
      await manager.getRepository(Tenant).update({ id: tenantId }, values);
      await manager
        .getRepository(AuditLog)
        .insert({
          tenant_id: tenantId,
          actor_id: actorId,
          action: 'company.settings_updated',
          entity_type: 'tenant',
          entity_id: tenantId,
        });
    });
    return { message: 'Company settings saved' };
  }
}

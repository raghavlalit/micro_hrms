import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EntityManager, IsNull, QueryFailedError } from 'typeorm';
import { Tenant, SubscriptionPlan } from './tenant.schemas';
import { CreateCompanyDto } from './company.dto';
import { companyProfile } from './company-profile';
import { TenantDefaultsService } from './tenant-defaults.service';
import { CompanyAdminService } from '../users/company-admin.service';
import { InvitationsService } from '../auth/invitations.service';
import { TenantDatabaseService } from './tenant-database.service';
import { AuditLog } from '../audit/audit.schemas';
import { MASTER_DATA_SEED } from './seeds/master-data.seed';

@Injectable()
export class CompanyOnboardingService {
  constructor(
    private readonly defaults: TenantDefaultsService,
    private readonly admins: CompanyAdminService,
    private readonly invitations: InvitationsService,
    private readonly tenants: TenantDatabaseService,
  ) {}

  async create(
    manager: EntityManager,
    dto: CreateCompanyDto,
    platformAdminId: string,
  ) {
    const profile = companyProfile(dto);
    const plan = await manager
      .getRepository(SubscriptionPlan)
      .findOneByOrFail({ code: 'trial' });
    const tenantId = randomUUID();
    const userId = randomUUID();
    try {
      await manager.getRepository(Tenant).insert({
        ...profile,
        id: tenantId,
        slug: dto.slug,
        status: 'trial',
        plan_code: 'trial',
        employee_limit: plan.employee_limit,
        user_limit: plan.user_limit,
        trial_starts_at: () => 'now()',
        // Trial duration has not been defined; do not silently invent an expiry policy.
        settings: {
          onboarding: {
            admin_user_id: userId,
            admin_email: dto.admin_email.trim().toLowerCase(),
            defaults_version: MASTER_DATA_SEED.version,
          },
        },
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'Company code already exists. Open the existing company instead.',
        );
      throw error;
    }
    return this.tenants.withManager(manager, tenantId, async (scoped) => {
      const adminRoleId = await this.defaults.create(scoped, tenantId);
      await this.admins.createInvited(
        scoped,
        tenantId,
        adminRoleId,
        dto.admin_name,
        dto.admin_email,
        userId,
      );
      const invitation = await this.invitations.issue(scoped, tenantId, userId);
      await scoped
        .getRepository(AuditLog)
        .insert({
          tenant_id: tenantId,
          action: 'company.created',
          entity_type: 'tenant',
          entity_id: tenantId,
          metadata: { platform_admin_id: platformAdminId },
        });
      return {
        company: {
          id: tenantId,
          name: dto.name,
          slug: dto.slug,
          status: 'trial',
        },
        invitation,
      };
    });
  }

  async reissue(
    manager: EntityManager,
    tenantId: string,
    platformAdminId: string,
  ) {
    const company = await manager
      .getRepository(Tenant)
      .findOneBy({ id: tenantId, archived_at: IsNull() });
    if (!company) throw new NotFoundException('Company not found');
    const settings = company.settings as {
      onboarding?: { admin_user_id?: string };
    };
    const userId = settings.onboarding?.admin_user_id;
    if (!userId)
      throw new ConflictException('This company has no onboarding invitation');
    return this.tenants.withManager(manager, tenantId, async (scoped) => {
      const invitation = await this.invitations.issue(scoped, tenantId, userId);
      await scoped
        .getRepository(AuditLog)
        .insert({
          tenant_id: tenantId,
          action: 'company.admin_invitation_reissued',
          entity_type: 'user',
          entity_id: userId,
          metadata: { platform_admin_id: platformAdminId },
        });
      return { invitation };
    });
  }
}

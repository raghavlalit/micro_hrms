import { Injectable } from '@nestjs/common';
import { PlatformDatabaseService } from './platform-database.service';
import { CompanyOnboardingService } from '../tenants/company-onboarding.service';
import { CompanyListDto, CreateCompanyDto } from '../tenants/company.dto';
import { Tenant } from '../tenants/tenant.schemas';

@Injectable()
export class PlatformCompaniesService {
  constructor(
    private readonly platformDb: PlatformDatabaseService,
    private readonly onboarding: CompanyOnboardingService,
  ) {}

  list(token: string, query: CompanyListDto) {
    return this.platformDb.withSession(token, async (manager) => {
      const builder = manager
        .getRepository(Tenant)
        .createQueryBuilder('company')
        .where('company.archived_at IS NULL');
      if (query.search)
        builder.andWhere(
          '(company.name ILIKE :search OR company.slug ILIKE :search)',
          { search: `%${query.search.replace(/[\\%_]/g, '\\$&')}%` },
        );
      const total = await builder.getCount();
      const items = await builder
        .select([
          'company.id AS id',
          'company.name AS name',
          'company.slug AS slug',
          'company.status AS status',
          'company.created_at AS created_at',
        ])
        .addSelect(
          "company.settings->'onboarding'->>'admin_email'",
          'admin_email',
        )
        .orderBy('company.created_at', 'DESC')
        .addOrderBy('company.id', 'ASC')
        .offset((query.page - 1) * query.limit)
        .limit(query.limit)
        .getRawMany();
      return { items, total, page: query.page, limit: query.limit };
    });
  }

  create(token: string, adminId: string, dto: CreateCompanyDto) {
    return this.platformDb.withSession(token, (manager) =>
      this.onboarding.create(manager, dto, adminId),
    );
  }
  reissue(token: string, adminId: string, companyId: string) {
    return this.platformDb.withSession(token, (manager) =>
      this.onboarding.reissue(manager, companyId, adminId),
    );
  }
}

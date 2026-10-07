import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TenantDirectoryService } from './tenant-directory.service';
import { CompanyController } from './company.controller';
import { TenantContextModule } from './tenant-context.module';
import { UsersModule } from '../users/users.module';
import { InvitationsModule } from '../auth/invitations.module';
import { CompanyOnboardingService } from './company-onboarding.service';
import { TenantDefaultsService } from './tenant-defaults.service';
import { CompanySettingsService } from './company-settings.service';
import { TenantMasterService } from './tenant-master.service';
@Module({
  imports: [
    DatabaseModule,
    TenantContextModule,
    UsersModule,
    InvitationsModule,
  ],
  providers: [
    TenantDirectoryService,
    TenantDefaultsService,
    CompanyOnboardingService,
    CompanySettingsService,
    TenantMasterService,
  ],
  controllers: [CompanyController],
  exports: [
    TenantDirectoryService,
    TenantContextModule,
    CompanyOnboardingService,
    TenantMasterService,
  ],
})
export class TenantsModule {}

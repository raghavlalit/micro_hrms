import { Module } from '@nestjs/common';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { BackgroundIdentityModule } from '../auth/background-identity.service';
import { BackgroundJobs } from './background-jobs.service';
@Module({
  imports: [TenantContextModule, BackgroundIdentityModule],
  providers: [BackgroundJobs],
  exports: [BackgroundJobs, BackgroundIdentityModule],
})
export class BackgroundJobsModule {}

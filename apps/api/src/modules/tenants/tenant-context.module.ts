import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { TenantDatabaseService } from './tenant-database.service';

// Shared tenant transaction boundary without importing onboarding workflows.
@Module({
  imports: [DatabaseModule],
  providers: [TenantDatabaseService],
  exports: [TenantDatabaseService],
})
export class TenantContextModule {}

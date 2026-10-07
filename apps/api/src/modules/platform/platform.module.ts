import { Module } from '@nestjs/common';
import { PlatformController } from './platform.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { DatabaseModule } from '../../database/database.module';
import { PlatformDatabaseService } from './platform-database.service';
import { PlatformCompaniesService } from './platform-companies.service';
@Module({
  imports: [DatabaseModule, TenantsModule],
  controllers: [PlatformController],
  providers: [PlatformDatabaseService, PlatformCompaniesService],
})
export class PlatformModule {}

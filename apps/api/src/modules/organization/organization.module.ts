import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { OrganizationController } from './organization.controller';
@Module({ imports: [TenantsModule], controllers: [OrganizationController] })
export class OrganizationModule {}

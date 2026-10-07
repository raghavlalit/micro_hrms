import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { PayrollSettingsController } from './payroll-settings.controller';
@Module({ imports: [TenantsModule], controllers: [PayrollSettingsController] })
export class PayrollModule {}

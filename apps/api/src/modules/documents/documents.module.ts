import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { DocumentSettingsController } from './document-settings.controller';
@Module({ imports: [TenantsModule], controllers: [DocumentSettingsController] })
export class DocumentsModule {}

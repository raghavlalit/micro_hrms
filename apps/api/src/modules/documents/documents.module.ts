import { Module } from '@nestjs/common';
import { TenantsModule } from '../tenants/tenants.module';
import { DocumentSettingsController } from './document-settings.controller';
import { DocumentController } from './document.controller';
import { DocumentAccess } from './document-access.service';
import { DocumentStorage } from './document-storage.service';
import { DocumentService } from './document.service';
import { EmployeeDocumentsModule } from '../employees/employee-document.service';
@Module({
  imports: [TenantsModule, EmployeeDocumentsModule],
  controllers: [DocumentSettingsController, DocumentController],
  providers: [DocumentAccess, DocumentStorage, DocumentService],
})
export class DocumentsModule {}

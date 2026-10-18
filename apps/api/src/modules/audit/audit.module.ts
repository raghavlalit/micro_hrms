import { Module } from '@nestjs/common';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { AuditController } from './audit.controller';
import { AuditService } from './audit.service';
@Module({
  imports: [TenantContextModule],
  controllers: [AuditController],
  providers: [AuditService],
})
export class AuditModule {}

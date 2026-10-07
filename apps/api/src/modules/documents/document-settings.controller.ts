import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { TenantMasterService } from '../tenants/tenant-master.service';
import { NamedMasterDto } from '../organization/organization.dto';
import { DocumentCategory } from './document.schemas';
@Controller('documents/categories')
@Access('tenant', 'documents.manage')
export class DocumentSettingsController {
  constructor(private readonly records: TenantMasterService) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, DocumentCategory);
  }
  @Post() create(@Req() r: AuthRequest, @Body() dto: NamedMasterDto) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      DocumentCategory,
      dto,
    );
  }
  @Put(':id') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NamedMasterDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      DocumentCategory,
      dto,
      id,
    );
  }
}

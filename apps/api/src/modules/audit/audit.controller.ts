import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  Req,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { AuditService } from './audit.service';
import { AuditListDto } from './audit.dto';

@Controller('audit-logs')
@Access('tenant', 'company.manage')
export class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Req() request: AuthRequest, @Query() dto: AuditListDto) {
    return this.audit.list(request.principal, dto);
  }
  @Get('options') options(@Req() request: AuthRequest) {
    return this.audit.options(request.principal);
  }
  @Get(':id') detail(
    @Req() request: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.audit.detail(request.principal, id);
  }
}

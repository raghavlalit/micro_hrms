import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { PlatformCompaniesService } from './platform-companies.service';
import { CompanyListDto, CreateCompanyDto } from '../tenants/company.dto';
@Controller('platform')
export class PlatformController {
  constructor(private readonly companies: PlatformCompaniesService) {}
  @Access('platform', 'platform.access')
  @Get('companies')
  list(@Req() req: AuthRequest, @Query() query: CompanyListDto) {
    return this.companies.list(req.sessionToken, query);
  }
  @Access('platform', 'platform.access')
  @Post('companies')
  create(@Req() req: AuthRequest, @Body() dto: CreateCompanyDto) {
    return this.companies.create(req.sessionToken, req.principal.id, dto);
  }
  @Access('platform', 'platform.access')
  @Post('companies/:id/admin-invitation')
  reissue(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.companies.reissue(req.sessionToken, req.principal.id, id);
  }
  @Access('platform', 'platform.access')
  @Get('overview')
  overview() {
    return {
      message: 'Platform administrator access verified.',
    };
  }
}

import { Body, Controller, Get, Put, Req } from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { CompanyProfileDto } from './company.dto';
import { CompanySettingsService } from './company-settings.service';
@Controller('company')
export class CompanyController {
  constructor(private readonly settings: CompanySettingsService) {}
  @Access('tenant', 'company.manage')
  @Get('settings')
  getSettings(@Req() req: AuthRequest) {
    return this.settings.get(req.principal.tenantId!);
  }
  @Access('tenant', 'company.manage')
  @Put('settings')
  updateSettings(@Req() req: AuthRequest, @Body() dto: CompanyProfileDto) {
    return this.settings.update(req.principal.tenantId!, req.principal.id, dto);
  }
  @Access('tenant', 'company.manage')
  @Get('access')
  access(@Req() req: AuthRequest) {
    return {
      tenantId: req.principal.tenantId,
      message: 'Company administration access verified',
    };
  }
}

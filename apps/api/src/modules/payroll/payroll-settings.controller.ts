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
import { SalaryComponent } from './payroll.schemas';
import { SalaryComponentDto } from './salary-component.dto';
import { SalaryService } from './salary.service';
@Controller('payroll/components')
@Access('tenant', 'payroll.manage')
export class PayrollSettingsController {
  constructor(
    private readonly records: TenantMasterService,
    private readonly salaries: SalaryService,
  ) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, SalaryComponent);
  }
  @Post() create(@Req() r: AuthRequest, @Body() dto: SalaryComponentDto) {
    return this.salaries.component(r.principal, dto);
  }
  @Put(':id') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryComponentDto,
  ) {
    return this.salaries.component(r.principal, dto, id);
  }
}

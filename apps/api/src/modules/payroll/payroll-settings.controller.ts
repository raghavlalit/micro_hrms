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
@Controller('payroll/components')
@Access('tenant', 'payroll.manage')
export class PayrollSettingsController {
  constructor(private readonly records: TenantMasterService) {}
  @Get() list(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, SalaryComponent);
  }
  @Post() create(@Req() r: AuthRequest, @Body() dto: SalaryComponentDto) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      SalaryComponent,
      dto,
    );
  }
  @Put(':id') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryComponentDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      SalaryComponent,
      dto,
      id,
    );
  }
}

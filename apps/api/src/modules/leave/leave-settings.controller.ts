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
import { LeavePolicy, LeaveType } from './leave.schemas';
import { LeavePolicyDto, LeaveTypeDto } from './leave-settings.dto';
import { LeaveSettingsService } from './leave-settings.service';
@Controller('leave')
@Access('tenant', 'leave.manage')
export class LeaveSettingsController {
  constructor(private readonly records: TenantMasterService, private readonly settings: LeaveSettingsService) {}
  @Get('types') types(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, LeaveType);
  }
  @Post('types') createType(@Req() r: AuthRequest, @Body() dto: LeaveTypeDto) {
    return this.settings.save(
      r.principal,
      LeaveType,
      dto,
    );
  }
  @Put('types/:id') updateType(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveTypeDto,
  ) {
    return this.settings.save(
      r.principal,
      LeaveType,
      dto,
      id,
    );
  }
  @Get('policies') policies(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, LeavePolicy);
  }
  @Post('policies') createPolicy(
    @Req() r: AuthRequest,
    @Body() dto: LeavePolicyDto,
  ) {
    return this.settings.save(
      r.principal,
      LeavePolicy,
      dto,
    );
  }
  @Put('policies/:id') updatePolicy(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeavePolicyDto,
  ) {
    return this.settings.save(
      r.principal,
      LeavePolicy,
      dto,
      id,
    );
  }
}

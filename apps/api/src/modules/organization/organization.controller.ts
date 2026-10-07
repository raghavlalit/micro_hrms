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
import {
  Department,
  Designation,
  Location,
  WorkSchedule,
} from './organization.schemas';
import {
  LocationDto,
  NamedMasterDto,
  WorkScheduleDto,
} from './organization.dto';

@Controller('organization')
@Access('tenant', 'company.manage')
export class OrganizationController {
  constructor(private readonly records: TenantMasterService) {}
  @Get('departments') departments(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, Department);
  }
  @Post('departments') createDepartment(
    @Req() r: AuthRequest,
    @Body() dto: NamedMasterDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      Department,
      dto,
    );
  }
  @Put('departments/:id') updateDepartment(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NamedMasterDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      Department,
      dto,
      id,
    );
  }
  @Get('designations') designations(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, Designation);
  }
  @Post('designations') createDesignation(
    @Req() r: AuthRequest,
    @Body() dto: NamedMasterDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      Designation,
      dto,
    );
  }
  @Put('designations/:id') updateDesignation(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NamedMasterDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      Designation,
      dto,
      id,
    );
  }
  @Get('locations') locations(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, Location);
  }
  @Post('locations') createLocation(
    @Req() r: AuthRequest,
    @Body() dto: LocationDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      Location,
      dto,
    );
  }
  @Put('locations/:id') updateLocation(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LocationDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      Location,
      dto,
      id,
    );
  }
  @Get('work-schedules') schedules(@Req() r: AuthRequest) {
    return this.records.list(r.principal.tenantId!, WorkSchedule);
  }
  @Post('work-schedules') createSchedule(
    @Req() r: AuthRequest,
    @Body() dto: WorkScheduleDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      WorkSchedule,
      dto,
    );
  }
  @Put('work-schedules/:id') updateSchedule(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: WorkScheduleDto,
  ) {
    return this.records.save(
      r.principal.tenantId!,
      r.principal.id,
      WorkSchedule,
      dto,
      id,
    );
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { EmployeeService } from './employee.service';
import {
  EmployeeContactDto,
  EmployeeInviteDto,
  EmployeeListDto,
  EmployeePrivateDto,
  EmployeeProfileDto,
  EmployeeStatusDto,
} from './employee.dto';

@Controller('employees')
@Access('tenant')
export class EmployeesController {
  constructor(private readonly employees: EmployeeService) {}
  @Get() list(@Req() r: AuthRequest, @Query() query: EmployeeListDto) {
    return this.employees.list(r.principal, query);
  }
  @Get('lookups') @Access('tenant', 'employees.manage') lookups(
    @Req() r: AuthRequest,
  ) {
    return this.employees.lookups(r.principal);
  }
  @Get('me') @Access('tenant', 'employees.read.self') me(
    @Req() r: AuthRequest,
  ) {
    return this.employees.me(r.principal);
  }
  @Put('me/contact') @Access('tenant', 'employees.read.self') contact(
    @Req() r: AuthRequest,
    @Body() dto: EmployeeContactDto,
  ) {
    return this.employees.selfContact(r.principal, dto);
  }
  @Get(':id') detail(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employees.detail(r.principal, id);
  }
  @Post() @Access('tenant', 'employees.manage') create(
    @Req() r: AuthRequest,
    @Body() dto: EmployeeProfileDto,
  ) {
    return this.employees.create(r.principal, dto);
  }
  @Put(':id') @Access('tenant', 'employees.manage') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeProfileDto,
  ) {
    return this.employees.update(r.principal, id, dto);
  }
  @Post(':id/status') @Access('tenant', 'employees.manage') status(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeStatusDto,
  ) {
    return this.employees.changeStatus(r.principal, id, dto);
  }
  @Post(':id/invitation') @Access('tenant', 'employees.manage') invite(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeeInviteDto,
  ) {
    return this.employees.invite(r.principal, id, dto);
  }
  @Get(':id/private') privateDetails(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.employees.readPrivate(r.principal, id);
  }
  @Put(':id/private') @Access('tenant', 'employees.manage') savePrivate(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EmployeePrivateDto,
  ) {
    return this.employees.savePrivate(r.principal, id, dto);
  }
}

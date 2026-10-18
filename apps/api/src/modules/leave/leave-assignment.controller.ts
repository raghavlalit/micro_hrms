import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { LeaveListDto } from './leave.dto';
import {
  LeaveAssignmentFilterDto,
  LeaveAssignmentPreviewDto,
} from './leave-assignment.dto';
import { LeaveAssignmentDirectory } from './leave-assignment-directory.service';
import { LeaveAssignmentJobs } from './leave-assignment-jobs.service';
@Controller('leave/assignments')
@Access('tenant', 'leave.manage')
export class LeaveAssignmentController {
  constructor(
    readonly directory: LeaveAssignmentDirectory,
    readonly jobs: LeaveAssignmentJobs,
  ) {}
  @Get() list(@Req() r: AuthRequest, @Query() q: LeaveAssignmentFilterDto) {
    return this.directory.list(r.principal, q);
  }
  @Get('departments') departments(@Req() r: AuthRequest) {
    return this.directory.lookup(r.principal, 'departments');
  }
  @Get('locations') locations(@Req() r: AuthRequest) {
    return this.directory.lookup(r.principal, 'locations');
  }
  @Get('employees/:id/policies') policies(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: LeaveAssignmentFilterDto,
  ) {
    return this.directory.options(r.principal, id, q.year);
  }
  @Post('preview') preview(
    @Req() r: AuthRequest,
    @Body() dto: LeaveAssignmentPreviewDto,
  ) {
    return this.jobs.preview(r.principal, dto);
  }
  @Get('jobs') history(@Req() r: AuthRequest) {
    return this.jobs.list(r.principal);
  }
  @Get('jobs/:id') get(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: LeaveListDto,
  ) {
    return this.jobs.get(r.principal, id, q.page);
  }
  @Post('jobs/:id/confirm') @HttpCode(202) confirm(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobs.confirm(r.principal, id);
  }
  @Post('jobs/:id/retry') @HttpCode(202) retry(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.jobs.confirm(r.principal, id, true);
  }
}

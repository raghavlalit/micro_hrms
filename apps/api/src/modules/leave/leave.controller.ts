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
import {
  LeaveApplicationDto,
  LeaveAdjustmentDto,
  LeaveCalendarDto,
  LeaveEntitlementDto,
  LeaveListDto,
  LeaveReasonDto,
  LeaveReviewDto,
  LeaveYearDto,
} from './leave.dto';
import { LeaveRequestService } from './leave-request.service';
import { LeaveBalanceService } from './leave-balance.service';
import { LeaveQueryService } from './leave-query.service';
@Controller('leave')
@Access('tenant')
export class LeaveController {
  constructor(
    readonly requests: LeaveRequestService,
    readonly balances: LeaveBalanceService,
    readonly queries: LeaveQueryService,
  ) {}
  @Get('me') @Access('tenant', 'leave.self') me(
    @Req() r: AuthRequest,
    @Query() q: LeaveYearDto,
  ) {
    return this.queries.overview(r.principal, q.year);
  }
  @Get('people') people(@Req() r: AuthRequest, @Query() q: LeaveListDto) {
    return this.queries.people(r.principal, q);
  }
  @Get('employees/:id') employee(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: LeaveYearDto,
  ) {
    return this.queries.overview(r.principal, q.year, id);
  }
  @Post('employees/:id/entitlements') @Access('tenant', 'leave.manage') setup(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveEntitlementDto,
  ) {
    return this.balances.setup(r.principal, id, dto);
  }
  @Post('balances/:id/adjustments') @Access('tenant', 'leave.manage') adjust(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveAdjustmentDto,
  ) {
    return this.balances.adjust(r.principal, id, dto);
  }
  @Get('balances/:id/entries') entries(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: LeaveListDto,
  ) {
    return this.queries.ledger(r.principal, id, q);
  }
  @Post('preview') @Access('tenant', 'leave.self') preview(
    @Req() r: AuthRequest,
    @Body() dto: LeaveApplicationDto,
  ) {
    return this.requests.preview(r.principal, dto);
  }
  @Post('requests') @Access('tenant', 'leave.self') submit(
    @Req() r: AuthRequest,
    @Body() dto: LeaveApplicationDto,
  ) {
    return this.requests.submit(r.principal, dto);
  }
  @Get('requests') list(@Req() r: AuthRequest, @Query() q: LeaveListDto) {
    return this.queries.requests(r.principal, q);
  }
  @Post('requests/:id/review') review(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveReviewDto,
  ) {
    return this.requests.review(r.principal, id, dto);
  }
  @Post('requests/:id/cancel') cancel(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LeaveReasonDto,
  ) {
    return this.requests.cancel(r.principal, id, dto);
  }
  @Get('calendar') calendar(
    @Req() r: AuthRequest,
    @Query() q: LeaveCalendarDto,
  ) {
    return this.queries.requests(
      r.principal,
      new LeaveListDto(),
      q.month ?? '',
    );
  }
}

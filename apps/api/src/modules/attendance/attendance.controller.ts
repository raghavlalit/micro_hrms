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
import { AttendanceService } from './attendance.service';
import { AttendanceRegularizationService } from './attendance-regularization.service';
import {
  AttendanceActionDto,
  AttendanceAdjustmentDto,
  AttendanceDayParams,
  AttendanceMonthDto,
  AttendancePeopleDto,
  AttendanceReviewDto,
  RegularizationDto,
  RegularizationListDto,
} from './attendance.dto';
@Controller('attendance')
@Access('tenant')
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly corrections: AttendanceRegularizationService,
  ) {}
  @Get('me') @Access('tenant', 'attendance.self') me(
    @Req() r: AuthRequest,
    @Query() q: AttendanceMonthDto,
  ) {
    return this.attendance.calendar(r.principal, q.month);
  }
  @Get('people') people(
    @Req() r: AuthRequest,
    @Query() q: AttendancePeopleDto,
  ) {
    return this.attendance.people(r.principal, q);
  }
  @Get('employees/:id') employee(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: AttendanceMonthDto,
  ) {
    return this.attendance.calendar(r.principal, q.month, id);
  }
  @Post('check-in') @Access('tenant', 'attendance.self') checkIn(
    @Req() r: AuthRequest,
    @Body() _dto: AttendanceActionDto,
  ) {
    return this.attendance.check(r.principal, false);
  }
  @Post('check-out') @Access('tenant', 'attendance.self') checkOut(
    @Req() r: AuthRequest,
    @Body() _dto: AttendanceActionDto,
  ) {
    return this.attendance.check(r.principal, true);
  }
  @Put('employees/:employeeId/days/:date')
  @Access('tenant', 'attendance.manage')
  adjust(
    @Req() r: AuthRequest,
    @Param() params: AttendanceDayParams,
    @Body() dto: AttendanceAdjustmentDto,
  ) {
    return this.attendance.adjust(
      r.principal,
      params.employeeId,
      params.date,
      dto,
    );
  }
  @Get('regularizations') list(
    @Req() r: AuthRequest,
    @Query() q: RegularizationListDto,
  ) {
    return this.corrections.list(r.principal, q);
  }
  @Post('regularizations') @Access('tenant', 'attendance.self') submit(
    @Req() r: AuthRequest,
    @Body() dto: RegularizationDto,
  ) {
    return this.corrections.submit(r.principal, dto);
  }
  @Post('regularizations/:id/review') review(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AttendanceReviewDto,
  ) {
    return this.corrections.review(r.principal, id, dto);
  }
}

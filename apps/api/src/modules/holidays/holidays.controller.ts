import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  Query,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { HolidayService } from './holiday.service';
import { HolidayCalendarDto, HolidayDto } from './holiday.dto';
@Controller('holidays')
@Access('tenant', 'company.manage')
export class HolidaysController {
  constructor(private readonly records: HolidayService) {}
  @Get('calendar') @Access('tenant') calendar(
    @Req() r: AuthRequest,
    @Query() dto: HolidayCalendarDto,
  ) {
    return this.records.calendar(r.principal, dto);
  }
  @Get() list(@Req() r: AuthRequest) {
    return this.records.list(r.principal);
  }
  @Post() create(@Req() r: AuthRequest, @Body() dto: HolidayDto) {
    return this.records.save(r.principal, dto);
  }
  @Put(':id') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: HolidayDto,
  ) {
    return this.records.save(r.principal, dto, id);
  }
}

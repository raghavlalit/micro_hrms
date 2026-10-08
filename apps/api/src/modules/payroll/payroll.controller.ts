import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { PayrollRunService } from './payroll-run.service';
import { SalaryService } from './salary.service';
import { PayslipService } from './payslip.service';
import {
  PayrollAdjustmentDto,
  PayrollAdjustmentEditDto,
  PayrollCalculateDto,
  PayrollListDto,
  PayrollRunDto,
  PayrollSettingsDto,
  PayrollTransitionDto,
  SalaryCreateDto,
  SalaryEditDto,
} from './payroll.dto';
@Controller('payroll')
@Access('tenant', 'payroll.manage')
export class PayrollController {
  constructor(
    readonly runs: PayrollRunService,
    readonly salaries: SalaryService,
    readonly slips: PayslipService,
  ) {}
  @Get('settings') settings(@Req() r: AuthRequest) {
    return this.runs.settings(r.principal);
  }
  @Put('settings') saveSettings(
    @Req() r: AuthRequest,
    @Body() dto: PayrollSettingsDto,
  ) {
    return this.runs.saveSettings(r.principal, dto);
  }
  @Get('people') people(@Req() r: AuthRequest, @Query() q: PayrollListDto) {
    return this.salaries.people(r.principal, q);
  }
  @Get('employees/:id/salaries') salariesFor(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.salaries.history(r.principal, id);
  }
  @Post('employees/:id/salaries') salary(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryCreateDto,
  ) {
    return this.salaries.create(r.principal, id, dto);
  }
  @Put('salaries/:id') editSalary(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SalaryEditDto,
  ) {
    return this.salaries.edit(r.principal, id, dto);
  }
  @Get('runs') list(@Req() r: AuthRequest, @Query() q: PayrollListDto) {
    return this.runs.list(r.principal, q);
  }
  @Post('runs') create(@Req() r: AuthRequest, @Body() dto: PayrollRunDto) {
    return this.runs.create(r.principal, dto);
  }
  @Get('runs/:id') detail(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runs.detail(r.principal, id);
  }
  @Get('runs/:id/versions/:version') version(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('version', ParseIntPipe) version: number,
  ) {
    return this.runs.history(r.principal, id, version);
  }
  @Post('runs/:id/calculate') calculate(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayrollCalculateDto,
  ) {
    return this.runs.calculate(r.principal, id, dto);
  }
  @Post('runs/:id/review') review(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayrollTransitionDto,
  ) {
    return this.runs.transition(r.principal, id, dto, false);
  }
  @Post('runs/:id/lock') lock(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayrollTransitionDto,
  ) {
    return this.runs.transition(r.principal, id, dto, true);
  }
  @Post('runs/:id/publish') publish(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayrollTransitionDto,
  ) {
    return this.slips.publish(r.principal, id, dto);
  }
  @Post('employees/:id/adjustments') adjust(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayrollAdjustmentDto,
  ) {
    return this.runs.adjust(r.principal, id, dto);
  }
  @Put('adjustments/:id') editAdjustment(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PayrollAdjustmentEditDto,
  ) {
    return this.runs.editAdjustment(r.principal, id, dto);
  }
}
@Controller('payslips')
@Access('tenant')
export class PayslipController {
  constructor(readonly slips: PayslipService) {}
  @Get('me') @Access('tenant', 'payslips.read.self') mine(
    @Req() r: AuthRequest,
    @Query() q: PayrollListDto,
  ) {
    return this.slips.list(r.principal, q);
  }
  @Get(':id') view(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.slips.view(r.principal, id);
  }
  @Get(':id/download') async download(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.slips.download(r.principal, id);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    return new StreamableFile(result.bytes);
  }
}

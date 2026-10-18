import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { ReportsService } from './reports.service';
import { ReportOptionsDto, ReportQueryDto } from './report.dto';
import { ReportExports } from './report-export.service';
import { ReportExportDto } from './report-export.dto';
@Controller('reports')
@Access('tenant')
export class ReportsController {
  constructor(
    readonly reports: ReportsService,
    readonly exports: ReportExports,
  ) {}
  @Post(':kind/export-jobs') @HttpCode(202) queueExport(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Body() dto: ReportExportDto,
  ) {
    return this.exports.enqueue(r.principal, this.reports.kind(kind), dto);
  }
  @Get('options') options(
    @Req() r: AuthRequest,
    @Query() dto: ReportOptionsDto,
  ) {
    return this.reports.options(r.principal, dto.kind);
  }
  @Get(':kind') view(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Query() dto: ReportQueryDto,
  ) {
    return this.reports.view(r.principal, this.reports.kind(kind), dto);
  }
  @Post(':kind/export') async export(
    @Req() r: AuthRequest,
    @Param('kind') kind: string,
    @Body() dto: ReportQueryDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.reports.export(
      r.principal,
      this.reports.kind(kind),
      dto,
    );
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    return new StreamableFile(Buffer.from(result.content, 'utf8'));
  }
}

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
  Res,
  StreamableFile,
} from '@nestjs/common';
import type { Response } from 'express';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { ReportExports } from './report-export.service';
import { ExportListDto, ExportRetryDto } from './report-export.dto';
@Controller('report-exports')
@Access('tenant')
export class ReportExportController {
  constructor(readonly exports: ReportExports) {}
  @Get() list(@Req() r: AuthRequest, @Query() dto: ExportListDto) {
    return this.exports.list(r.principal, dto);
  }
  @Get(':id') status(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.exports.status(r.principal, id);
  }
  @Post(':id/retry') @HttpCode(202) retry(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: ExportRetryDto,
  ) {
    return this.exports.retry(r.principal, id);
  }
  @Get(':id/download') async download(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.exports.download(r.principal, id);
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    return new StreamableFile(result.bytes);
  }
}

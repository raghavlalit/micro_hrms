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
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { DocumentService } from './document.service';
import {
  DocumentActionDto,
  DocumentCreateDto,
  DocumentListDto,
  DocumentUpdateDto,
  DocumentUploadDto,
} from './document.dto';
import { DOCUMENT_MAX_BYTES } from './document-file';
import type { DocumentUploadFile } from './document-file';

const uploadOptions = {
  limits: {
    fileSize: DOCUMENT_MAX_BYTES,
    files: 1,
    fields: 10,
    parts: 11,
    fieldSize: 2048,
  },
};
@Controller('documents')
@Access('tenant')
export class DocumentController {
  constructor(readonly documents: DocumentService) {}
  @Get() list(@Req() r: AuthRequest, @Query() dto: DocumentListDto) {
    return this.documents.list(r.principal, dto);
  }
  @Get('people') @Access('tenant', 'documents.manage') people(
    @Req() r: AuthRequest,
    @Query() dto: DocumentListDto,
  ) {
    return this.documents.people(r.principal, dto);
  }
  @Post()
  @Access('tenant', 'documents.manage')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  create(
    @Req() r: AuthRequest,
    @Body() dto: DocumentCreateDto,
    @UploadedFile() file?: DocumentUploadFile,
  ) {
    return this.documents.create(r.principal, dto, file);
  }
  @Get(':id') detail(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.documents.detail(r.principal, id);
  }
  @Put(':id') @Access('tenant', 'documents.manage') update(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocumentUpdateDto,
  ) {
    return this.documents.update(r.principal, id, dto);
  }
  @Post(':id/versions')
  @Access('tenant', 'documents.manage')
  @UseInterceptors(FileInterceptor('file', uploadOptions))
  version(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocumentUploadDto,
    @UploadedFile() file?: DocumentUploadFile,
  ) {
    return this.documents.addVersion(r.principal, id, dto, file);
  }
  @Post(':id/archive') @Access('tenant', 'documents.manage') archive(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DocumentActionDto,
  ) {
    return this.documents.archive(r.principal, id, dto);
  }
  @Post(':id/versions/:versionId/archive')
  @Access('tenant', 'documents.manage')
  archiveVersion(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Body() dto: DocumentActionDto,
  ) {
    return this.documents.archive(r.principal, id, dto, versionId);
  }
  @Get(':id/versions/:versionId/download') async download(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionId', ParseUUIDPipe) versionId: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.documents.download(r.principal, id, versionId);
    response.setHeader('Content-Type', result.mime);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    return new StreamableFile(result.bytes);
  }
}

import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { ReportQueryDto } from './report.dto';
export class ReportExportDto extends ReportQueryDto {
  @IsUUID() operation_id: string;
}
export class ExportListDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class ExportRetryDto {
  @IsOptional() @IsIn(['web']) source?: 'web';
}

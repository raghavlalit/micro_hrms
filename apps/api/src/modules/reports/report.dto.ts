import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
export const REPORT_KINDS = [
  'employees',
  'attendance',
  'leave',
  'balances',
  'payroll',
  'components',
] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export class ReportOptionsDto {
  @IsIn(REPORT_KINDS) kind: ReportKind;
}
export class ReportQueryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() employee_id?: string;
  @IsOptional() @IsUUID() department_id?: string;
  @IsOptional() @IsUUID() location_id?: string;
  @IsOptional() @IsString() @MaxLength(32) status?: string;
  @IsOptional()
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;
  @IsOptional()
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
  @IsOptional() @IsUUID() run_id?: string;
}

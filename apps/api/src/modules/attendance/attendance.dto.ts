import { Transform, Type } from 'class-transformer';
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
  MinLength,
} from 'class-validator';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class AttendanceMonthDto {
  @IsOptional()
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/)
  month?: string;
}
export class AttendancePeopleDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 50;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(100) search?: string;
}
export class RegularizationListDto extends AttendancePeopleDto {
  @IsOptional() @IsIn(['mine', 'review']) scope?: 'mine' | 'review';
  @IsOptional() @IsIn(['pending', 'approved', 'rejected']) status?: string;
}
export class AttendanceTimesDto {
  // Require an explicit offset; never interpret a client timestamp as server-local time.
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/)
  check_in?: string | null;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/T\d{2}:\d{2}.*(?:Z|[+-]\d{2}:\d{2})$/)
  check_out?: string | null;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class RegularizationDto extends AttendanceTimesDto {
  @IsDateString({ strict: true })
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  work_date!: string;
}
export class AttendanceAdjustmentDto extends AttendanceTimesDto {
  @IsIn(['times', 'absent', 'leave', 'holiday', 'weekly_off']) mode!:
    'times' | 'absent' | 'leave' | 'holiday' | 'weekly_off';
}
export class AttendanceReviewDto {
  @IsIn(['approved', 'rejected']) decision!: 'approved' | 'rejected';
  @IsOptional() @Transform(trim) @IsString() @MaxLength(500) comment?: string;
}
export class AttendanceActionDto {
  // Optional fixed source marker makes unexpected timestamp/employee fields fail DTO validation.
  @IsOptional() @IsIn(['web']) source?: 'web';
}
export class AttendanceDayParams {
  @IsUUID() employeeId!: string;
  @IsDateString({ strict: true })
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  date!: string;
}

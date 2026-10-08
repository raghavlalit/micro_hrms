import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class LeaveListDto {
  @IsOptional() @IsIn(['mine', 'review']) scope?: 'mine' | 'review';
  @IsOptional()
  @IsIn(['pending', 'approved', 'rejected', 'cancelled'])
  status?: string;
  @IsOptional() @IsUUID() employee_id?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class LeaveYearDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
}
export class LeaveCalendarDto {
  @IsOptional()
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/)
  month?: string;
}
export class LeaveReasonDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
export class LeaveApplicationDto extends LeaveReasonDto {
  @IsUUID() policy_id: string;
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  start_date: string;
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  end_date: string;
  @IsIn(['full', 'am', 'pm']) start_half: 'full' | 'am' | 'pm' = 'full';
  @IsIn(['full', 'am', 'pm']) end_half: 'full' | 'am' | 'pm' = 'full';
}
export class LeaveReviewDto {
  @IsIn(['approved', 'rejected']) decision: 'approved' | 'rejected';
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}
export class LeaveEntitlementDto extends LeaveReasonDto {
  @IsUUID() policy_id: string;
  @IsInt() @Min(1900) @Max(2200) year: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(366)
  credited?: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(366) carry_forward = 0;
}
export class LeaveAdjustmentDto extends LeaveReasonDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(-366) @Max(366) units: number;
  @IsUUID() operation_id: string;
}

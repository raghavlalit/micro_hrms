import {
  IsIn,
  IsInt,
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  Min,
  Max,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export class HolidayDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  holiday_date: string;
  @IsOptional() @IsUUID() location_id?: string | null;
  @Transform(trim)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

export class HolidayCalendarDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2200)
  year?: number;
  @IsOptional() @IsIn(['all', 'company', 'mine', 'location']) scope?:
    'all' | 'company' | 'mine' | 'location';
  @IsOptional() @IsUUID() location_id?: string;
}

import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CompanyAddressDto } from '../tenants/company.dto';

export class NamedMasterDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
  @IsString() @Matches(/^[A-Z][A-Z0-9_]{0,39}$/) code: string;
}
export class LocationDto extends NamedMasterDto {
  @IsObject()
  @ValidateNested()
  @Type(() => CompanyAddressDto)
  address: CompanyAddressDto;
}
export class WorkScheduleDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional() @IsUUID() location_id?: string | null;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(7)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  working_days: number[];
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)
  start_time: string;
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/) end_time: string;
  @IsInt() @Min(0) @Max(1440) late_grace_minutes: number;
  @IsInt() @Min(1) @Max(1440) half_day_minutes: number;
  @IsInt() @Min(1) @Max(1440) full_day_minutes: number;
}

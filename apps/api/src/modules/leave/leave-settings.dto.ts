import {
  IsBoolean,
  IsDateString,
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
import { NamedMasterDto } from '../organization/organization.dto';

export class LeaveTypeDto extends NamedMasterDto {
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsBoolean() is_active: boolean;
}
export class LeavePolicyDto {
  @IsUUID() leave_type_id: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(366)
  annual_entitlement: number;
  @IsBoolean() is_paid: boolean;
  @IsBoolean() balance_controlled: boolean;
  @IsBoolean() carry_forward_enabled: boolean;
  @IsBoolean() exclude_non_working_days: boolean;
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  effective_from: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  effective_to?: string | null;
}

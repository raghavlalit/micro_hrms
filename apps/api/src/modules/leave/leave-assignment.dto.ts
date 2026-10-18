import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { LeaveEntitlementDto } from './leave.dto';

export class LeaveAssignmentFilterDto {
  @Type(() => Number) @IsInt() @Min(1900) @Max(2200) year: number;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() department_id?: string;
  @IsOptional() @IsUUID() location_id?: string;
  @IsOptional() @IsUUID() policy_id?: string;
  @IsOptional()
  @IsIn(['assigned', 'partial', 'unassigned', 'not_applicable'])
  status?: string;
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
}
export class LeaveAssignmentPreviewDto extends LeaveEntitlementDto {
  @IsUUID() operation_id: string;
  @IsBoolean() all_matching: boolean;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(10000)
  @IsUUID('all', { each: true })
  employee_ids?: string[];
  @IsDefined()
  @ValidateNested()
  @Type(() => LeaveAssignmentFilterDto)
  filters: LeaveAssignmentFilterDto;
}

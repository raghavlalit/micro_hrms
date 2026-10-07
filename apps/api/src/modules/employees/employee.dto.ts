import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsIn,
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

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;
export const EMPLOYEE_STATUSES = [
  'invited',
  'active',
  'on_notice',
  'inactive',
  'terminated',
] as const;
export class EmployeeAddressDto {
  @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(20) postal_code?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
}
export class EmergencyContactDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(60) relationship?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
}
export class EmployeeContactDto {
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsObject()
  @ValidateNested()
  @Type(() => EmployeeAddressDto)
  address: EmployeeAddressDto;
  @IsObject()
  @ValidateNested()
  @Type(() => EmergencyContactDto)
  emergency_contact: EmergencyContactDto;
}
export class EmployeeProfileDto extends EmployeeContactDto {
  @Transform(trim)
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9_-]{0,39}$/)
  employee_code: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) first_name: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(100) last_name: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date_of_birth?: string | null;
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string | null;
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  joining_date: string;
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  employment_type: string;
  @IsOptional() @IsUUID() department_id?: string | null;
  @IsOptional() @IsUUID() designation_id?: string | null;
  @IsOptional() @IsUUID() location_id?: string | null;
  @IsOptional() @IsUUID() manager_id?: string | null;
  @IsOptional() @IsUUID() work_schedule_id?: string | null;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  probation_ends_on?: string | null;
}
export class EmployeeListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(120) search = '';
  @IsOptional() @IsIn(EMPLOYEE_STATUSES) status?: string;
  @IsOptional() @IsUUID() department_id?: string;
  @IsOptional() @IsUUID() designation_id?: string;
  @IsOptional() @IsUUID() location_id?: string;
  @IsOptional() @IsUUID() manager_id?: string;
}
export class EmployeeStatusDto {
  @IsIn(EMPLOYEE_STATUSES) status: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  notice_date?: string | null;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  termination_date?: string | null;
}
export class EmployeeInviteDto {
  @IsIn(['employee', 'manager']) role: 'employee' | 'manager';
}
export class PrivateFieldDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) label: string;
  @IsString() @MinLength(1) @MaxLength(250) value: string;
}
export class EmployeePrivateDto {
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PrivateFieldDto)
  bank_details: PrivateFieldDto[];
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PrivateFieldDto)
  statutory_identifiers: PrivateFieldDto[];
}

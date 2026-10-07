import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
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
export class AccessReasonDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
}
export class UserRolesDto extends AccessReasonDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  role_ids!: string[];
}
export class InviteUserDto extends UserRolesDto {
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  display_name!: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;
}
export class UserStatusDto extends AccessReasonDto {
  @IsIn(['enabled', 'disabled']) status!: 'enabled' | 'disabled';
}
export class RoleDetailsDto extends AccessReasonDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(80) name!: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  permission_codes!: string[];
}
export class CreateRoleDto extends RoleDetailsDto {
  @Transform(trim) @IsString() @Matches(/^[a-z][a-z0-9_]{1,39}$/) code!: string;
}
export class UserListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsIn(['active', 'invited', 'disabled']) status?: string;
  @IsOptional() @IsUUID('4') role_id?: string;
}

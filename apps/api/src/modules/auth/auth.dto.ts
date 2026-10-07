import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
export class LoginDto {
  @IsIn(['platform', 'tenant'])
  kind: 'platform' | 'tenant';

  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  company?: string;
}
export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;
  @IsString()
  @MinLength(15)
  @MaxLength(128)
  newPassword: string;
}

export class ActivateAccountDto {
  @IsString()
  @Matches(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[0-9a-f]{64}$/,
  )
  token: string;
  @IsString() @MinLength(15) @MaxLength(128) password: string;
}

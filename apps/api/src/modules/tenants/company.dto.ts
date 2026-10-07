import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CompanyAddressDto {
  @IsOptional() @IsString() @MaxLength(200) line1?: string;
  @IsOptional() @IsString() @MaxLength(200) line2?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(20) postal_code?: string;
  @IsOptional() @IsString() @MaxLength(100) country?: string;
}

export class CompanyProfileDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;
  @IsString() @MaxLength(100) timezone: string;
  @IsString() @Matches(/^[A-Z]{3}$/) currency: string;
  @IsIn(['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd']) date_format: string;
  @IsEmail() @MaxLength(254) contact_email: string;
  @IsOptional() @IsString() @MaxLength(30) contact_phone?: string;
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CompanyAddressDto)
  address?: CompanyAddressDto;
}

export class CreateCompanyDto extends CompanyProfileDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  @Matches(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  slug: string;
  @IsEmail() @MaxLength(254) admin_email: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  admin_name: string;
}

export class CompanyListDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}

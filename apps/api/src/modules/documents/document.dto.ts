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

const optionalDate = ({ value }: { value: unknown }) =>
  value === '' ? null : value;
export class DocumentListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
  @IsOptional() @IsUUID() employee_id?: string;
  @IsOptional() @IsUUID() category_id?: string;
  @IsIn(['active', 'archived', 'all']) status = 'active';
  @IsIn(['all', 'expired', 'expiring']) expiry = 'all';
}
export class DocumentReasonDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
export class DocumentMetadataDto extends DocumentReasonDto {
  @IsUUID() category_id: string;
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  title: string;
  @IsIn(['hr_only', 'employee', 'team']) visibility: string;
  @Transform(optionalDate)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  issue_date?: string | null;
  @Transform(optionalDate)
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  expiry_date?: string | null;
}
export class DocumentCreateDto extends DocumentMetadataDto {
  @IsUUID() employee_id: string;
  @IsUUID() operation_id: string;
}
export class DocumentUpdateDto extends DocumentMetadataDto {
  @IsUUID() revision: string;
}
export class DocumentActionDto extends DocumentReasonDto {
  @IsUUID() revision: string;
}
export class DocumentUploadDto extends DocumentActionDto {
  @IsUUID() operation_id: string;
}

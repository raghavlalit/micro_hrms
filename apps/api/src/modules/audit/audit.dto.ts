import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class AuditListDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100000) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) actor?: string;
  @IsOptional() @IsUUID() actor_id?: string;
  @IsOptional() @Matches(/^[a-z][a-z0-9_]{0,63}$/) module?: string;
  @IsOptional() @Matches(/^[a-z][a-z0-9_.]{0,127}$/) action?: string;
  @IsOptional() @IsUUID() entity_id?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  from?: string;
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  to?: string;
}

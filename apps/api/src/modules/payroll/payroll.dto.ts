import { Type, Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
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
  ValidateNested,
} from 'class-validator';
export class PayrollListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsString() @MaxLength(100) search?: string;
}
export class PayrollReasonDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;
}
export class SalaryLineDto {
  @IsUUID() component_id: string;
  @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount: string;
}
export class SalaryEditDto extends PayrollReasonDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => SalaryLineDto)
  lines: SalaryLineDto[];
}
export class SalaryCreateDto extends SalaryEditDto {
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  effective_from: string;
}
export class PayrollSettingsDto {
  @IsBoolean() unpaid_leave_deduction: boolean;
}
export class PayrollRunDto {
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-(0[1-9]|1[0-2])$/) month: string;
  @Matches(/^(19\d{2}|20\d{2}|21\d{2}|2200)-\d{2}-\d{2}$/)
  @IsDateString({ strict: true })
  pay_date: string;
}
export class PayrollCalculateDto extends PayrollReasonDto {
  @IsBoolean() discard_adjustments = false;
  @IsUUID() revision: string;
}
export class PayrollTransitionDto extends PayrollReasonDto {
  @Type(() => Number) @IsInt() @Min(1) calculation_version: number;
  @IsUUID() revision: string;
}
export class PayrollAdjustmentDto extends PayrollTransitionDto {
  @IsUUID() operation_id: string;
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsIn(['earning', 'deduction']) kind: 'earning' | 'deduction';
  @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount: string;
}
export class PayrollAdjustmentEditDto extends PayrollTransitionDto {
  @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) amount: string;
  @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) expected_amount: string;
}

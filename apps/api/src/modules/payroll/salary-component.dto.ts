import { IsBoolean, IsIn } from 'class-validator';
import { NamedMasterDto } from '../organization/organization.dto';
export class SalaryComponentDto extends NamedMasterDto {
  @IsIn(['earning', 'deduction']) kind: 'earning' | 'deduction';
  @IsBoolean() is_active: boolean;
}

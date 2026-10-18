import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
export class NotificationListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['all', 'unread', 'read']) status:
    'all' | 'unread' | 'read' = 'all';
}
export class NotificationReadDto {
  @IsBoolean() read: boolean;
}
export class NotificationRetryDto {
  // Fixed optional marker lets empty action bodies reject unexpected fields.
  @IsOptional() @IsIn(['web']) source?: 'web';
}
export class DeliveryListDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 20;
  @IsOptional() @IsIn(['pending', 'failed', 'sent', 'skipped']) status?: string;
}

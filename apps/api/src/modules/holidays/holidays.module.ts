import { Module } from '@nestjs/common';
import { TenantContextModule } from '../tenants/tenant-context.module';
import { HolidaysController } from './holidays.controller';
import { HolidayService } from './holiday.service';
@Module({
  imports: [TenantContextModule],
  controllers: [HolidaysController],
  providers: [HolidayService],
  exports: [HolidayService],
})
export class HolidaysModule {}

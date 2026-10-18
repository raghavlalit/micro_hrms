import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { NotificationsService } from './notifications.service';
import {
  NotificationListDto,
  NotificationReadDto,
  NotificationRetryDto,
  DeliveryListDto,
} from './notification.dto';
@Controller('notifications')
@Access('tenant')
export class NotificationsController {
  constructor(readonly notifications: NotificationsService) {}
  @Get() list(@Req() r: AuthRequest, @Query() dto: NotificationListDto) {
    return this.notifications.list(r.principal, dto);
  }
  @Get('unread-count') unread(@Req() r: AuthRequest) {
    return this.notifications.unread(r.principal);
  }
  @Put('read-all') all(
    @Req() r: AuthRequest,
    @Body() _dto: NotificationRetryDto,
  ) {
    return this.notifications.readAll(r.principal);
  }
  @Get('deliveries') @Access('tenant', 'company.manage') deliveries(
    @Req() r: AuthRequest,
    @Query() dto: DeliveryListDto,
  ) {
    return this.notifications.deliveries(r.principal, dto);
  }
  @Post('deliveries/:id/retry') @Access('tenant', 'company.manage') retry(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: NotificationRetryDto,
  ) {
    return this.notifications.retry(r.principal, id);
  }
  @Put(':id/read') read(
    @Req() r: AuthRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: NotificationReadDto,
  ) {
    return this.notifications.read(r.principal, id, dto.read);
  }
}

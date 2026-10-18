import { Controller, Get, Req } from '@nestjs/common';
import { Access } from '../auth/auth.guard';
import type { AuthRequest } from '../auth/auth.guard';
import { DashboardService } from './dashboard.service';
@Controller('dashboard')
@Access('tenant')
export class DashboardController {
  constructor(readonly dashboard: DashboardService) {}
  @Get() overview(@Req() request: AuthRequest) {
    return this.dashboard.overview(request.principal);
  }
}

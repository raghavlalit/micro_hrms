import { Body, Controller, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { cookieName, Public } from './auth.guard';
import type { AuthRequest } from './auth.guard';
import { ForgotPasswordDto, ResetPasswordDto } from './password-recovery.dto';
import {
  PasswordRecoveryService,
  RESET_REQUEST_MESSAGE,
} from './password-recovery.service';

@Controller('auth')
export class PasswordRecoveryController {
  constructor(private readonly recovery: PasswordRecoveryService) {}

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  async request(@Body() dto: ForgotPasswordDto, @Req() request: AuthRequest) {
    await this.recovery.request(dto, request.ip ?? 'unknown');
    return { message: RESET_REQUEST_MESSAGE };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  async reset(
    @Body() dto: ResetPasswordDto,
    @Req() request: AuthRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.recovery.reset(dto, request.ip ?? 'unknown');
    response.clearCookie(cookieName(), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/',
    });
    return { message: 'Password reset. Sign in with your new password.' };
  }
}

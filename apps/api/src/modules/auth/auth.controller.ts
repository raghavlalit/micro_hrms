import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { Access, cookieName, Public } from './auth.guard';
import type { AuthRequest } from './auth.guard';
import { ActivateAccountDto, ChangePasswordDto, LoginDto } from './auth.dto';

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
});
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('activate')
  @HttpCode(200)
  async activate(@Body() dto: ActivateAccountDto, @Req() req: AuthRequest) {
    await this.auth.activate(dto.token, dto.password, req.ip ?? 'unknown');
    return {
      message: 'Account activated. Sign in using your company code and email.',
    };
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: LoginDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = await this.auth.login(dto, req.ip ?? 'unknown');
    res.cookie(cookieName(), token, {
      ...cookieOptions(),
      maxAge: 8 * 60 * 60 * 1000,
    });
    return { user: await this.auth.authenticate(token) };
  }
  @Access('authenticated')
  @Get('me')
  me(@Req() req: AuthRequest) {
    return { user: req.principal };
  }
  @Access('authenticated')
  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.sessionToken, req.principal);
    res.clearCookie(cookieName(), cookieOptions());
    return { message: 'Signed out' };
  }
  @Access('authenticated')
  @Post('logout-all')
  @HttpCode(200)
  async logoutAll(
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout(req.sessionToken, req.principal, true);
    res.clearCookie(cookieName(), cookieOptions());
    return { message: 'All sessions signed out' };
  }
  @Access('authenticated')
  @Post('password')
  @HttpCode(200)
  async password(
    @Body() dto: ChangePasswordDto,
    @Req() req: AuthRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(req.principal, dto);
    res.clearCookie(cookieName(), cookieOptions());
    return { message: 'Password changed. Please sign in again.' };
  }
}

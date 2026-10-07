import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import type { Principal } from './auth.service';

export const Public = () => SetMetadata('auth.public', true);
export const Access = (
  scope: 'authenticated' | 'platform' | 'tenant',
  ...permissions: string[]
) => SetMetadata('auth.access', { scope, permissions });
export interface AuthRequest extends Request {
  principal: Principal;
  sessionToken: string;
}
export const cookieName = () =>
  process.env.NODE_ENV === 'production'
    ? '__Host-microhrms'
    : 'microhrms_session';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly origins: Set<string>;
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {
    if (process.env.NODE_ENV === 'production' && !process.env.AUTH_ORIGINS)
      throw new Error('AUTH_ORIGINS is required in production');
    this.origins = new Set(
      (
        process.env.AUTH_ORIGINS ??
        'http://localhost:4200,http://localhost:3000'
      )
        .split(',')
        .map((x) => x.trim()),
    );
    for (const origin of this.origins) {
      const parsed = new URL(origin);
      if (
        parsed.origin !== origin ||
        (process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:')
      )
        throw new Error('AUTH_ORIGINS must contain exact permitted origins');
    }
  }
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    const res = context.switchToHttp().getResponse<Response>();
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (
        req.headers['x-hrms-request'] !== '1' ||
        (req.headers.origin && !this.origins.has(req.headers.origin))
      )
        throw new ForbiddenException(
          'Request origin or CSRF header is invalid',
        );
    }
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean>('auth.public', targets))
      return true;
    const policy = this.reflector.getAllAndOverride<{
      scope: string;
      permissions: string[];
    }>('auth.access', targets);
    if (!policy)
      throw new ForbiddenException('Route access policy is not configured');
    const cookies = (req.headers.cookie ?? '')
      .split(';')
      .map((x) => x.trim())
      .filter((x) => x.startsWith(`${cookieName()}=`));
    if (cookies.length !== 1) throw new UnauthorizedException('Please sign in');
    req.sessionToken = cookies[0].slice(cookieName().length + 1);
    req.principal = await this.auth.authenticate(req.sessionToken);
    if (policy.scope !== 'authenticated' && policy.scope !== req.principal.kind)
      throw new ForbiddenException('This account cannot access this area');
    if (req.principal.mustChangePassword && policy.scope !== 'authenticated')
      throw new ForbiddenException('Change your temporary password first');
    if (!policy.permissions.every((p) => req.principal.permissions.includes(p)))
      throw new ForbiddenException('Permission denied');
    return true;
  }
}

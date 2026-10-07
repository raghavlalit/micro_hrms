import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { TenantDirectoryService } from '../tenants/tenant-directory.service';
import { credentialHash, hashPassword, verifyPassword } from './password';
import { LoginDto, ChangePasswordDto } from './auth.dto';
import { AuthRepository } from './auth.repository';
import { InvitationsService } from './invitations.service';
import { AuditLog } from '../audit/audit.schemas';
import { EmployeeAccountService } from '../employees/employee-account.service';

export interface Principal {
  kind: 'platform' | 'tenant';
  id: string;
  email: string;
  tenantId?: string;
  permissions: string[];
  mustChangePassword: boolean;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
@Injectable()
export class AuthService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly tenants: TenantDatabaseService,
    private readonly directory: TenantDirectoryService,
    private readonly repository: AuthRepository,
    private readonly invitations: InvitationsService,
    private readonly employeeAccounts: EmployeeAccountService,
  ) {}

  async activate(token: string, password: string, ip: string): Promise<void> {
    await this.throttle(`activation-ip:${ip}`, 50);
    await this.throttle(`activation-token:${credentialHash(token)}`, 10);
    const tenantId = token.split('.')[0];
    const passwordHash = await hashPassword(password);
    try {
      await this.tenants.withTenant(tenantId, async (manager) => {
        await this.employeeAccounts.lockTenant(manager, tenantId);
        const userId = await this.invitations.activate(
          manager,
          token,
          passwordHash,
        );
        await this.employeeAccounts.activated(manager, tenantId, userId);
        await manager.getRepository(AuditLog).insert({
          tenant_id: tenantId,
          actor_id: userId,
          action: 'user.activated',
          entity_type: 'user',
          entity_id: userId,
        });
      });
    } catch (error) {
      if (error instanceof ForbiddenException)
        throw new UnauthorizedException(
          'Activation link is invalid or expired',
        );
      throw error;
    }
  }

  async throttle(key: string, limit: number): Promise<void> {
    const attempts = await this.repository.incrementAttempts(
      credentialHash(key),
    );
    if (attempts > limit)
      throw new HttpException(
        'Too many attempts. Try again in 15 minutes.',
        429,
      );
  }

  private scope<T>(
    tenantId: string | undefined,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return tenantId
      ? this.tenants.withTenant(tenantId, work)
      : this.db.transaction(work);
  }

  async login(dto: LoginDto, ip: string): Promise<string> {
    const email = dto.email.trim().toLowerCase();
    await this.throttle(`ip:${ip}`, 100);
    await this.throttle(
      `login:${dto.kind}:${dto.kind === 'tenant' ? (dto.company ?? '') : ''}:${email}`,
      10,
    );
    let tenantId: string | undefined;
    if (dto.kind === 'tenant') {
      if (!dto.company)
        throw new BadRequestException('Company code is required');
      tenantId = await this.directory.findActiveIdBySlug(dto.company);
      if (!tenantId) {
        await verifyPassword(dto.password, null);
        throw new UnauthorizedException('Invalid login details');
      }
    }
    return this.scope(tenantId, async (manager) => {
      const user = await this.repository.lockIdentity(
        manager,
        tenantId,
        'email',
        email,
      );
      const matches = await verifyPassword(
        dto.password,
        user?.password_hash ?? null,
      );
      if (
        !matches ||
        !user ||
        (tenantId ? user.status !== 'active' : user.disabled_at !== null)
      )
        throw new UnauthorizedException('Invalid login details');
      const token = `${tenantId ? `t.${tenantId}` : 'p'}.${randomBytes(32).toString('hex')}`;
      await this.repository.createSession(
        manager,
        tenantId,
        user.id,
        credentialHash(token),
      );
      return token;
    });
  }

  private parse(token: string): string | undefined {
    const parts = token.split('.');
    if (
      parts.length === 2 &&
      parts[0] === 'p' &&
      /^[a-f0-9]{64}$/.test(parts[1])
    )
      return undefined;
    if (
      parts.length === 3 &&
      parts[0] === 't' &&
      UUID.test(parts[1]) &&
      /^[a-f0-9]{64}$/.test(parts[2])
    )
      return parts[1];
    throw new UnauthorizedException('Please sign in');
  }

  async authenticate(token: string): Promise<Principal> {
    const tenantId = this.parse(token);
    return this.scope(tenantId, async (manager) => {
      const user = await this.repository.findSessionIdentity(
        manager,
        tenantId,
        credentialHash(token),
      );
      if (!user) throw new UnauthorizedException('Please sign in');
      const permissions = tenantId
        ? await this.repository.permissions(manager, user.id)
        : ['platform.access'];
      return {
        kind: tenantId ? 'tenant' : 'platform',
        id: user.id,
        email: user.email,
        tenantId,
        permissions,
        mustChangePassword: !!user.must_change_password,
      };
    });
  }

  async logout(
    token: string,
    principal: Principal,
    all = false,
  ): Promise<void> {
    await this.scope(principal.tenantId, (manager) =>
      this.repository.revokeSessions(
        manager,
        principal.tenantId,
        all ? principal.id : credentialHash(token),
        all,
      ),
    );
  }

  async changePassword(
    principal: Principal,
    dto: ChangePasswordDto,
  ): Promise<void> {
    await this.throttle(`password:${principal.kind}:${principal.id}`, 10);
    if (dto.currentPassword === dto.newPassword)
      throw new BadRequestException('Choose a different password');
    const newHash = await hashPassword(dto.newPassword);
    await this.scope(principal.tenantId, async (manager) => {
      const user = await this.repository.lockIdentity(
        manager,
        principal.tenantId,
        'id',
        principal.id,
      );
      if (
        !(await verifyPassword(
          dto.currentPassword,
          user?.password_hash ?? null,
        ))
      )
        throw new ForbiddenException('Current password is incorrect');
      await this.repository.updatePassword(
        manager,
        principal.tenantId,
        principal.id,
        newHash,
      );
      await this.repository.revokeSessions(
        manager,
        principal.tenantId,
        principal.id,
        true,
      );
    });
  }
}

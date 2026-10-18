import { ForbiddenException, Injectable, Module } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { DatabaseModule } from '../../database/database.module';
import { User } from '../users/user.schemas';
import { AuthRepository } from './auth.repository';
import type { Principal } from './auth.service';
@Injectable()
export class BackgroundIdentity {
  constructor(private readonly repository: AuthRepository) {}
  async resolve(
    manager: EntityManager,
    tenantId: string,
    userId: string,
  ): Promise<Principal> {
    const user = await manager
      .getRepository(User)
      .findOne({
        select: { id: true, email: true },
        where: { tenant_id: tenantId, id: userId, status: 'active' },
      });
    if (!user)
      throw new ForbiddenException('Requesting account is unavailable');
    return {
      kind: 'tenant',
      id: userId,
      tenantId,
      email: String(user.email),
      mustChangePassword: false,
      permissions: await this.repository.permissions(manager, userId),
    };
  }
}
@Module({
  imports: [DatabaseModule],
  providers: [AuthRepository, BackgroundIdentity],
  exports: [BackgroundIdentity],
})
export class BackgroundIdentityModule {}

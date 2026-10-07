import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { EntityManager, IsNull } from 'typeorm';
import { AuthToken } from './auth.schemas';
import { User } from '../users/user.schemas';
import { credentialHash } from './password';

@Injectable()
export class InvitationsService {
  async issue(manager: EntityManager, tenantId: string, userId: string) {
    // Lock the user first in both issuance and activation to avoid lock-order deadlocks.
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .setLock('pessimistic_write')
      .getOne();
    if (!user || user.status !== 'invited')
      throw new ConflictException(
        'This account is already activated or unavailable',
      );
    await manager
      .getRepository(AuthToken)
      .update(
        { user_id: userId, purpose: 'invitation', consumed_at: IsNull() },
        { consumed_at: () => 'now()' },
      );
    const token = `${tenantId}.${randomBytes(32).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await manager.getRepository(AuthToken).insert({
      tenant_id: tenantId,
      user_id: userId,
      purpose: 'invitation',
      token_hash: credentialHash(token),
      expires_at: expiresAt,
    });
    // The raw token is returned once. Only its hash is stored in PostgreSQL.
    return { token, expires_at: expiresAt.toISOString() };
  }

  async activate(
    manager: EntityManager,
    token: string,
    passwordHash: string,
  ): Promise<string> {
    const tokens = manager.getRepository(AuthToken);
    const invitation = await tokens.findOne({
      where: { token_hash: credentialHash(token), purpose: 'invitation' },
    });
    if (!invitation)
      throw new UnauthorizedException('Activation link is invalid or expired');
    const userId = String(invitation.user_id);
    const user = await manager
      .getRepository(User)
      .createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .setLock('pessimistic_write')
      .getOne();
    const valid = await tokens
      .createQueryBuilder('token')
      .where('token.id = :id', { id: invitation.id })
      .andWhere('token.consumed_at IS NULL')
      .andWhere('token.expires_at > now()')
      .setLock('pessimistic_write')
      .getOne();
    if (!valid || !user || user.status !== 'invited')
      throw new UnauthorizedException('Activation link is invalid or expired');
    await manager
      .getRepository(User)
      .update(
        { id: userId },
        { password_hash: passwordHash, status: 'active' },
      );
    await tokens.update(
      { user_id: userId, purpose: 'invitation', consumed_at: IsNull() },
      { consumed_at: () => 'now()' },
    );
    return userId;
  }
}

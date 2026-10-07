import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { User, UserRole } from './user.schemas';

@Injectable()
export class CompanyAdminService {
  async createInvited(
    manager: EntityManager,
    tenantId: string,
    roleId: string,
    name: string,
    email: string,
    userId: string,
  ): Promise<string> {
    await manager.getRepository(User).insert({
      id: userId,
      tenant_id: tenantId,
      display_name: name,
      email: email.trim().toLowerCase(),
      status: 'invited',
      password_hash: null,
    });
    await manager
      .getRepository(UserRole)
      .insert({ tenant_id: tenantId, user_id: userId, role_id: roleId });
    return userId;
  }
}

import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { Role, User, UserRole } from './user.schemas';

export const BUILT_IN_ROLES = ['company_admin', 'hr', 'manager', 'employee'];

// Call while holding the tenant row lock, including employee lifecycle changes.
export async function protectLastCompanyAdmin(
  manager: EntityManager,
  tenantId: string,
  userId: string,
) {
  const admins = await manager
    .getRepository(User)
    .createQueryBuilder('user')
    .innerJoin(
      UserRole.options.name,
      'membership',
      'membership.user_id = user.id AND membership.tenant_id = user.tenant_id',
    )
    .innerJoin(
      Role.options.name,
      'role',
      'role.id = membership.role_id AND role.tenant_id = membership.tenant_id',
    )
    .select('user.id', 'id')
    .where(
      'user.tenant_id = :tenantId AND user.status = :status AND role.code = :code',
      { tenantId, status: 'active', code: 'company_admin' },
    )
    .getRawMany<{ id: string }>();
  if (admins.length === 1 && admins[0].id === userId)
    throw new ConflictException(
      'Keep at least one active Company Admin. Activate another administrator first.',
    );
}

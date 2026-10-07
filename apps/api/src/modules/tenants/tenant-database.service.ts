import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import { Tenant } from './tenant.schemas';

@Injectable()
export class TenantDatabaseService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  // Business callers must first authenticate and authorize membership.
  // AuthService also uses this isolated scope to validate tenant credentials;
  // no business data is returned until the password/session has been verified.
  // This helper alone is not authentication and must not consume an unchecked header.
  async withTenant<T>(
    trustedTenantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction((manager) =>
      this.withManager(manager, trustedTenantId, work),
    );
  }

  // Onboarding supplies its existing transaction so company + defaults stay atomic.
  async withManager<T>(
    manager: EntityManager,
    trustedTenantId: string,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trustedTenantId,
      )
    ) {
      throw new ForbiddenException('Invalid tenant context');
    }
    if (!manager.queryRunner?.isTransactionActive)
      throw new Error('Tenant scope requires an active transaction');
    // Drop platform catalog access before working with tenant business records.
    await manager.query(
      "SELECT set_config('app.platform_session_hash', '', true)",
    );
    await manager.query("SELECT set_config('app.tenant_id', $1, true)", [
      trustedTenantId,
    ]);
    const tenant = await manager.getRepository(Tenant).findOne({
      select: { id: true },
      where: {
        id: trustedTenantId,
        status: In(['active', 'trial']),
        archived_at: IsNull(),
      },
    });
    if (!tenant) throw new ForbiddenException('Tenant is not active');
    return work(manager);
  }
}

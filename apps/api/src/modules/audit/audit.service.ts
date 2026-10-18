import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { User } from '../users/user.schemas';
import { AuditLog } from './audit.schemas';
import { AuditListDto } from './audit.dto';
import { auditDetails } from './audit-details';

export interface AuditRow {
  id: string;
  action: string;
  module: string;
  entity_type: string;
  entity_id: string | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  created_at: Date;
  metadata?: unknown;
}

@Injectable()
export class AuditService {
  constructor(private readonly tenants: TenantDatabaseService) {}

  // Read model owned by audit: join only the actor identity in this tenant.
  private query(manager: EntityManager, tenantId: string) {
    return manager
      .getRepository(AuditLog)
      .createQueryBuilder('event')
      .leftJoin(
        User.options.name,
        'actor',
        'actor.id = event.actor_id AND actor.tenant_id = event.tenant_id',
      )
      .where('event.tenant_id = :tenantId', { tenantId })
      .select([
        'event.id AS id',
        'event.action AS action',
        "split_part(event.action, '.', 1) AS module",
        'event.entity_type AS entity_type',
        'event.entity_id AS entity_id',
        'event.actor_id AS actor_id',
        'actor.display_name AS actor_name',
        'actor.email AS actor_email',
        'event.created_at AS created_at',
      ]);
  }

  list(actor: Principal, dto: AuditListDto) {
    if (dto.from && dto.to && dto.from > dto.to)
      throw new BadRequestException('From date must not be after to date');
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = this.query(manager, actor.tenantId!);
      if (dto.actor?.trim())
        query.andWhere(
          "strpos(lower(concat(actor.display_name, ' ', actor.email)), lower(:actor)) > 0",
          { actor: dto.actor.trim() },
        );
      if (dto.actor_id)
        query.andWhere('event.actor_id = :actorId', { actorId: dto.actor_id });
      if (dto.module)
        query.andWhere("split_part(event.action, '.', 1) = :module", {
          module: dto.module,
        });
      if (dto.action)
        query.andWhere('event.action = :action', { action: dto.action });
      if (dto.entity_id)
        query.andWhere('event.entity_id = :entityId', {
          entityId: dto.entity_id,
        });
      // Dates are inclusive UTC calendar days, independent of the DB session timezone.
      if (dto.from)
        query.andWhere('event.created_at >= :from', {
          from: `${dto.from}T00:00:00.000Z`,
        });
      if (dto.to)
        query.andWhere(
          "event.created_at < CAST(:to AS timestamptz) + interval '24 hours'",
          { to: `${dto.to}T00:00:00.000Z` },
        );
      const total = await query.getCount();
      const items = await query
        .orderBy('event.created_at', 'DESC')
        .addOrderBy('event.id', 'DESC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany<AuditRow>();
      return { items, total, page: dto.page, limit: dto.limit };
    });
  }

  options(actor: Principal) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const rows = await manager
        .getRepository(AuditLog)
        .createQueryBuilder('event')
        .select('event.action', 'action')
        .distinct(true)
        .where('event.tenant_id = :tenantId', { tenantId: actor.tenantId })
        .orderBy('event.action', 'ASC')
        .getRawMany<{ action: string }>();
      return {
        actions: rows.map((row) => row.action),
        modules: [...new Set(rows.map((row) => row.action.split('.')[0]))],
      };
    });
  }

  detail(actor: Principal, id: string) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const row = await this.query(manager, actor.tenantId!)
        .addSelect('event.metadata', 'metadata')
        .andWhere('event.id = :id', { id })
        .getRawOne<AuditRow>();
      if (!row) throw new NotFoundException('Audit event not found');
      const { metadata, ...event } = row;
      return { ...event, details: auditDetails(metadata) };
    });
  }
}

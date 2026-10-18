import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import type { Principal } from '../auth/auth.service';
import { TenantDatabaseService } from '../tenants/tenant-database.service';
import { AuditLog } from '../audit/audit.schemas';
import { Notification, OutboxEvent } from './notification.schemas';
import { NotificationListDto, DeliveryListDto } from './notification.dto';
import { notificationLink } from './notification-delivery.service';
@Injectable()
export class NotificationsService {
  constructor(readonly tenants: TenantDatabaseService) {}
  list(actor: Principal, dto: NotificationListDto) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = manager
        .getRepository(Notification)
        .createQueryBuilder('notification')
        .where(
          'notification.tenant_id = :tenantId AND notification.recipient_id = :userId',
          { tenantId: actor.tenantId, userId: actor.id },
        );
      if (dto.status !== 'all')
        query.andWhere(
          `notification.read_at IS ${dto.status === 'read' ? 'NOT ' : ''}NULL`,
        );
      const total = await query.getCount();
      const rows = await query
        .select([
          'notification.id AS id',
          'notification.type AS type',
          'notification.title AS title',
          'notification.body AS body',
          'notification.resource_type AS resource_type',
          'notification.resource_id AS resource_id',
          'notification.read_at AS read_at',
          'notification.created_at AS created_at',
        ])
        .orderBy('notification.created_at', 'DESC')
        .addOrderBy('notification.id', 'DESC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany<{
          id: string;
          type: string;
          title: string;
          body: string;
          resource_type: string;
          resource_id: string;
          read_at: string | null;
          created_at: string;
        }>();
      const unread = await manager.getRepository(Notification).countBy({
        tenant_id: actor.tenantId,
        recipient_id: actor.id,
        read_at: IsNull(),
      });
      return {
        items: rows.map((row) => ({
          ...row,
          link: notificationLink(
            row.resource_type,
            row.resource_id,
            row.type.endsWith('.submitted') ? 'reviewer' : 'self',
          ),
        })),
        total,
        unread,
        page: dto.page,
        limit: dto.limit,
      };
    });
  }
  unread(actor: Principal) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => ({
      unread: await manager.getRepository(Notification).countBy({
        tenant_id: actor.tenantId,
        recipient_id: actor.id,
        read_at: IsNull(),
      }),
    }));
  }
  read(actor: Principal, id: string, read: boolean) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const result = await manager
        .getRepository(Notification)
        .update(
          { tenant_id: actor.tenantId, recipient_id: actor.id, id },
          { read_at: read ? new Date() : null },
        );
      if (!result.affected)
        throw new NotFoundException('Notification not found');
      return { id, read };
    });
  }
  readAll(actor: Principal) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const result = await manager.getRepository(Notification).update(
        {
          tenant_id: actor.tenantId,
          recipient_id: actor.id,
          read_at: IsNull(),
        },
        { read_at: new Date() },
      );
      return { updated: result.affected ?? 0 };
    });
  }
  deliveries(actor: Principal, dto: DeliveryListDto) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const query = manager
        .getRepository(OutboxEvent)
        .createQueryBuilder('event')
        .where('event.tenant_id = :tenantId AND event.event_type = :type', {
          tenantId: actor.tenantId,
          type: 'notification.email',
        });
      if (dto.status)
        query.andWhere('event.delivery_status = :status', {
          status: dto.status,
        });
      const total = await query.getCount();
      const items = await query
        .select([
          'event.id AS id',
          'event.aggregate_id AS notification_id',
          'event.delivery_status AS status',
          'event.attempts AS attempts',
          'event.last_error_code AS error_code',
          'event.created_at AS created_at',
          'event.available_at AS next_attempt_at',
          'event.processed_at AS finished_at',
        ])
        .orderBy('event.created_at', 'DESC')
        .addOrderBy('event.id', 'DESC')
        .offset((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .getRawMany();
      return { items, total };
    });
  }
  retry(actor: Principal, id: string) {
    return this.tenants.withTenant(actor.tenantId!, async (manager) => {
      const events = manager.getRepository(OutboxEvent);
      const row = await events
        .createQueryBuilder('event')
        .where(
          'event.tenant_id = :tenantId AND event.id = :id AND event.event_type = :type',
          { tenantId: actor.tenantId, id, type: 'notification.email' },
        )
        .setLock('pessimistic_write')
        .getOne();
      if (!row) throw new NotFoundException('Delivery not found');
      if (row.delivery_status !== 'failed')
        throw new ConflictException('Only failed deliveries can be retried');
      if ((row.payload as { kind?: string }).kind === 'password_reset')
        throw new ConflictException(
          'Request a new password reset link from the sign-in screen',
        );
      if ((row.payload as { kind?: string }).kind === 'invitation')
        throw new ConflictException(
          'Create a replacement invitation to send a fresh activation link',
        );
      await events.update(
        { tenant_id: actor.tenantId, id },
        {
          delivery_status: 'pending',
          attempts: 0,
          processed_at: null,
          available_at: new Date(),
          last_error_code: null,
        },
      );
      await manager.getRepository(AuditLog).insert({
        tenant_id: actor.tenantId,
        actor_id: actor.id,
        action: 'notification.delivery_retried',
        entity_type: 'notification_delivery',
        entity_id: id,
      });
      return { id, status: 'pending' };
    });
  }
}

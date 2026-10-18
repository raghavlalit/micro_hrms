import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import { NotificationDelivery } from './notification-delivery.service';
import { redisConnection } from '../background-jobs/redis-connection';
@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationWorker.name);
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private dispatching = false;
  constructor(
    @InjectDataSource() readonly database: DataSource,
    readonly delivery: NotificationDelivery,
  ) {}
  onModuleInit() {
    const connection = redisConnection();
    const prefix = process.env.NOTIFICATION_QUEUE_PREFIX ?? 'microhrms';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(prefix))
      throw new Error('Invalid NOTIFICATION_QUEUE_PREFIX');
    this.queue = new Queue('notifications-email', {
      prefix,
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      defaultJobOptions: {
        attempts: 5,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
    this.worker = new Worker(
      'notifications-email',
      async (job) => {
        const data = job.data as { tenantId?: unknown; eventId?: unknown };
        if (
          typeof data.tenantId !== 'string' ||
          typeof data.eventId !== 'string' ||
          ![data.tenantId, data.eventId].every((value) =>
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
              value,
            ),
          )
        )
          throw new Error('INVALID_NOTIFICATION_REFERENCE');
        await this.delivery.deliver(data.tenantId, data.eventId);
      },
      {
        prefix,
        connection: { ...connection, maxRetriesPerRequest: null },
        concurrency: 3,
      },
    );
    this.queue.on('error', () =>
      this.logger.warn(
        'Notification queue unavailable; PostgreSQL retains pending deliveries.',
      ),
    );
    this.worker.on('error', () =>
      this.logger.warn('Notification worker connection unavailable.'),
    );
    this.worker.on('failed', () =>
      this.logger.warn(
        'Notification delivery failed; inspect tenant delivery status.',
      ),
    );
    this.timer = setInterval(() => {
      void this.dispatch();
    }, 5000);
    this.timer.unref();
    void this.dispatch();
  }
  async dispatch() {
    if (this.dispatching || !this.queue) return;
    this.dispatching = true;
    try {
      // The database view exposes only due event references across active tenants.
      // Payload and HR records are re-read under tenant RLS by the consumer.
      const events = await this.database
        .createQueryBuilder()
        .from('notification_dispatch_candidates', 'candidate')
        .select(['candidate.id AS id', 'candidate.tenant_id AS tenant_id'])
        .orderBy('candidate.available_at', 'ASC')
        .addOrderBy('candidate.id', 'ASC')
        .limit(100)
        .getRawMany<{ id: string; tenant_id: string }>();
      for (const event of events)
        await this.queue.add(
          'deliver',
          { tenantId: event.tenant_id, eventId: event.id },
          { jobId: event.id },
        );
    } catch {
      this.logger.warn(
        'Notification dispatch deferred; pending events will be retried.',
      );
    } finally {
      this.dispatching = false;
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.worker?.close();
    await this.queue?.close();
  }
}

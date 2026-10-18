import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Queue, Worker } from 'bullmq';
import { redisConnection } from './redis-connection';
import { BackgroundProcessor } from './background-processor.service';
@Injectable()
export class BackgroundWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BackgroundWorker.name);
  private queue?: Queue;
  private worker?: Worker;
  private timer?: NodeJS.Timeout;
  private dispatching?: Promise<void>;
  constructor(
    @InjectDataSource() readonly db: DataSource,
    readonly processor: BackgroundProcessor,
  ) {}
  onModuleInit() {
    const connection = redisConnection(),
      prefix = process.env.BACKGROUND_QUEUE_PREFIX ?? 'microhrms';
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(prefix))
      throw new Error('Invalid BACKGROUND_QUEUE_PREFIX');
    this.queue = new Queue('document-report-generation', {
      prefix,
      connection: {
        ...connection,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      },
      defaultJobOptions: { removeOnComplete: true, removeOnFail: true },
    });
    this.worker = new Worker(
      'document-report-generation',
      async (item) => {
        const { tenantId, jobId } = item.data as {
          tenantId: unknown;
          jobId: unknown;
        };
        if (
          ![tenantId, jobId].every(
            (value) =>
              typeof value === 'string' &&
              /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
                value,
              ),
          )
        )
          throw new Error('INVALID_JOB_REFERENCE');
        await this.processor.process(tenantId as string, jobId as string);
      },
      {
        prefix,
        connection: { ...connection, maxRetriesPerRequest: null },
        concurrency: 1,
      },
    );
    this.queue.on('error', () =>
      this.logger.warn(
        'Background queue unavailable; jobs remain in PostgreSQL.',
      ),
    );
    this.worker.on('error', () =>
      this.logger.warn('Background worker connection unavailable.'),
    );
    this.worker.on('failed', () =>
      this.logger.warn('Background execution interrupted; inspect job status.'),
    );
    this.timer = setInterval(() => {
      void this.dispatch();
    }, 5000);
    this.timer.unref();
    void this.dispatch();
  }
  dispatch() {
    if (this.dispatching) return this.dispatching;
    this.dispatching = this.dispatchOnce().finally(() => {
      this.dispatching = undefined;
    });
    return this.dispatching;
  }
  private async dispatchOnce() {
    try {
      const candidates = await this.db
        .createQueryBuilder()
        .from('background_job_candidates', 'job')
        .select(['job.id AS id', 'job.tenant_id AS tenant_id'])
        .orderBy('job.available_at', 'ASC')
        .addOrderBy('job.id', 'ASC')
        .limit(100)
        .getRawMany<{ id: string; tenant_id: string }>();
      for (const job of candidates)
        await this.queue?.add(
          'generate',
          { tenantId: job.tenant_id, jobId: job.id },
          { jobId: job.id },
        );
    } catch {
      this.logger.warn(
        'Background dispatch deferred; pending jobs will be rediscovered.',
      );
    }
  }
  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.dispatching;
    await this.worker?.close();
    await this.queue?.close();
  }
}

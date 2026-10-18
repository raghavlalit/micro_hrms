import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { NotificationWorkerModule } from './notification-worker.module';
async function main() {
  const worker = await NestFactory.createApplicationContext(
    NotificationWorkerModule,
    { abortOnError: false },
  );
  worker.enableShutdownHooks();
}
void main().catch(() => {
  console.error(
    'Notification worker could not start. Check database, Redis and email configuration.',
  );
  process.exitCode = 1;
});

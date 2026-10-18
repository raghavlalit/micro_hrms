import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { BackgroundWorkerModule } from './background-worker.module';
async function main() {
  const worker = await NestFactory.createApplicationContext(
    BackgroundWorkerModule,
    { abortOnError: false },
  );
  worker.enableShutdownHooks();
}
void main().catch(() => {
  console.error(
    'Background worker could not start. Check database, Redis and storage configuration.',
  );
  process.exitCode = 1;
});

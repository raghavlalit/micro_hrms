import { config } from 'dotenv';
import { resolve } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { entities } from './entities';

// Both src/database and dist/database resolve to the API workspace's .env.
export const apiEnvPath = resolve(__dirname, '../../.env');
config({ path: apiEnvPath, quiet: true });

export function databaseOptions(
  migrations = false,
  env: NodeJS.ProcessEnv = process.env,
): DataSourceOptions {
  const key = migrations ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL';
  const value = env[key];
  if (!value)
    throw new Error(`${key} is required. See docs/database-setup.md.`);
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${key} must be a PostgreSQL URL.`);
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !url.hostname ||
    !url.username ||
    !url.password ||
    url.pathname.length < 2
  ) {
    throw new Error(
      `${key} requires a PostgreSQL host, username, password and database.`,
    );
  }
  // Connection-string TLS parameters must not override certificate verification.
  if ([...url.searchParams.keys()].some((key) => key.startsWith('ssl')))
    throw new Error(
      'Configure TLS using DATABASE_SSL and DATABASE_SSL_CA, not URL ssl parameters.',
    );
  const ssl = env.DATABASE_SSL ?? 'false';
  if (!['true', 'false'].includes(ssl))
    throw new Error('DATABASE_SSL must be true or false.');
  if (env.NODE_ENV === 'production' && ssl !== 'true')
    throw new Error(
      'Production database connections require DATABASE_SSL=true.',
    );
  const poolSize = Number(env.DATABASE_POOL_SIZE ?? 10);
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 100)
    throw new Error('DATABASE_POOL_SIZE must be an integer between 1 and 100.');
  return {
    type: 'postgres',
    url: value,
    entities,
    uuidExtension: 'pgcrypto',
    installExtensions: false,
    migrations: [resolve(__dirname, 'migrations/*{.js,.ts}')],
    migrationsTableName: 'schema_migrations',
    migrationsTransactionMode: 'all',
    synchronize: false,
    migrationsRun: false,
    // SQL error logging can include sensitive bind parameters; log sanitized application errors instead.
    logging: false,
    ssl:
      ssl === 'true'
        ? {
            rejectUnauthorized: true,
            ...(env.DATABASE_SSL_CA
              ? { ca: env.DATABASE_SSL_CA.replace(/\\n/g, '\n') }
              : {}),
          }
        : false,
    extra: {
      max: poolSize,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
    },
    applicationName: migrations ? 'microhrms-migrations' : 'microhrms-api',
  };
}

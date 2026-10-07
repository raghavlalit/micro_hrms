const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const rootEnv = path.join(root, '.env');
if (fs.existsSync(rootEnv)) {
  console.error('Root .env already exists; refusing to replace database credentials. See docs/database-setup.md.');
  process.exit(1);
}
const apiEnv = path.join(root, 'apps/api/.env');
const existing = fs.existsSync(apiEnv) ? fs.readFileSync(apiEnv, 'utf8') : 'NODE_ENV=development\nPORT=3000\n';
if (/^\s*(DATABASE_URL|MIGRATION_DATABASE_URL|DATABASE_SSL)\s*=/m.test(existing)) {
  console.error('API database configuration already exists; refusing to overwrite it.');
  process.exit(1);
}
const migrationPassword = crypto.randomBytes(24).toString('hex');
const appPassword = crypto.randomBytes(24).toString('hex');
fs.writeFileSync(rootEnv, `POSTGRES_PORT=5433\nPOSTGRES_PASSWORD=${migrationPassword}\nAPP_DB_PASSWORD=${appPassword}\n`, { flag: 'wx' });
fs.writeFileSync(apiEnv, `${existing.trimEnd()}\nDATABASE_URL=postgresql://microhrms_app:${appPassword}@127.0.0.1:5433/microhrms\nMIGRATION_DATABASE_URL=postgresql://microhrms_migrator:${migrationPassword}@127.0.0.1:5433/microhrms\nDATABASE_SSL=false\nDATABASE_POOL_SIZE=10\n`);
console.log('Created local database configuration without printing credentials.');

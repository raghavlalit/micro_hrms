const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { DataSource } = require('typeorm');
const { AppModule } = require('../dist/app.module');
const { databaseOptions } = require('../dist/database/database.options');
const { DatabaseRoleGuard } = require('../dist/database/database-role.guard');

async function main() {
  const app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const response = await fetch(`${await app.getUrl()}/api/v1`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'Hello World!');
    const [{ current_user }] = await app
      .get(DataSource)
      .query('SELECT current_user');
    assert.equal(current_user, 'microhrms_app');
    console.log(
      'PASS API starts, responds to HTTP, and connects as the restricted database role',
    );
  } finally {
    await app.close();
  }
  const privileged = new DataSource(databaseOptions(true));
  try {
    await privileged.initialize();
    await assert.rejects(
      () => new DatabaseRoleGuard(privileged).onModuleInit(),
      /restricted non-owner role/,
    );
    console.log('PASS API startup guard rejects migration credentials');
  } finally {
    if (privileged.isInitialized) await privileged.destroy();
  }
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});

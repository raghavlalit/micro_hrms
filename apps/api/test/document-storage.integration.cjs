/* Local S3 protocol stub: exercises the real SDK without any cloud account. */
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID, createHash } = require('node:crypto');
const {
  DocumentStorage,
} = require('../dist/modules/documents/document-storage.service');
async function main() {
  const objects = new Map();
  let puts = 0;
  const server = http.createServer(async (request, response) => {
    const key = new URL(request.url, 'http://localhost').pathname;
    if (request.method === 'PUT') {
      assert.equal(request.headers['if-none-match'], '*');
      assert.equal(request.headers['x-amz-server-side-encryption'], 'AES256');
      assert(!request.headers['x-amz-acl']);
      if (objects.has(key))
        return response
          .writeHead(412, { 'Content-Type': 'application/xml' })
          .end('<Error><Code>PreconditionFailed</Code></Error>');
      const chunks = [];
      for await (const chunk of request) chunks.push(chunk);
      objects.set(key, Buffer.concat(chunks));
      puts++;
      return response.writeHead(200, { ETag: '"synthetic"' }).end();
    }
    const bytes = objects.get(key);
    if (!bytes)
      return response
        .writeHead(404, { 'Content-Type': 'application/xml' })
        .end('<Error><Code>NoSuchKey</Code></Error>');
    response.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': bytes.length,
    });
    response.end(bytes);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  process.env.DOCUMENT_STORAGE_DRIVER = 's3';
  process.env.DOCUMENT_S3_BUCKET = 'synthetic-documents';
  process.env.DOCUMENT_S3_ENDPOINT = `http://127.0.0.1:${server.address().port}`;
  process.env.DOCUMENT_S3_FORCE_PATH_STYLE = 'true';
  process.env.DOCUMENT_S3_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'synthetic-access';
  process.env.AWS_SECRET_ACCESS_KEY = 'synthetic-secret';
  process.env.AWS_REQUEST_CHECKSUM_CALCULATION = 'WHEN_REQUIRED';
  try {
    const storage = new DocumentStorage(),
      key = [randomUUID(), randomUUID(), randomUUID()].join('/'),
      bytes = Buffer.from('%PDF-1.4\nsynthetic\n%%EOF'),
      checksum = createHash('sha256').update(bytes).digest('hex');
    await storage.save(key, bytes, 'application/pdf');
    assert((await storage.read(key, checksum)).equals(bytes));
    assert.equal(puts, 1);
    await assert.rejects(
      () => storage.save(key, bytes, 'application/pdf'),
      (error) => error.getStatus() === 503,
    );
    await assert.rejects(
      () => storage.read(key, 'invalid'),
      (error) => error.getStatus() === 503,
    );
    await assert.rejects(
      () => storage.read('../outside', 'invalid'),
      (error) => error.getStatus() === 404,
    );
    process.env.NODE_ENV = 'production';
    process.env.DOCUMENT_STORAGE_DRIVER = 'local';
    assert.throws(() => new DocumentStorage(), /Production documents require/);
    console.log(
      'PASS S3 adapter uses private immutable writes, reads exact bytes, verifies integrity, rejects invalid keys and requires S3 in production',
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

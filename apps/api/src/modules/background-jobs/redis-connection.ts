export function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://127.0.0.1:6380');
  if (
    !['redis:', 'rediss:'].includes(url.protocol) ||
    url.search ||
    !/^\/\d*$/.test(url.pathname || '/')
  )
    throw new Error('Invalid REDIS_URL');
  const db = Number(url.pathname.slice(1) || 0);
  if (!Number.isInteger(db) || db < 0 || db > 15)
    throw new Error('Invalid Redis database');
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    ...(url.protocol === 'rediss:'
      ? { tls: { rejectUnauthorized: true } }
      : {}),
    connectTimeout: 5000,
  };
}

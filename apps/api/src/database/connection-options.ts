import { readFileSync } from 'node:fs';
import type { DataSourceOptions } from 'typeorm';

export function connectionOptions(
  env: Record<string, string | undefined> = process.env,
): DataSourceOptions {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const url = new URL(env.DATABASE_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('Expected a PostgreSQL URL');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!local && !env.PGSSLROOTCERT) {
    throw new Error('PGSSLROOTCERT is required for hosted PostgreSQL');
  }
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) {
    url.searchParams.delete(key);
  }
  return {
    type: 'postgres',
    url: url.toString(),
    entities: [],
    synchronize: false,
    logging: false,
    ssl: local
      ? false
      : {
          rejectUnauthorized: true,
          ca: readFileSync(env.PGSSLROOTCERT!, 'utf8'),
        },
    extra: { max: 5, application_name: 'appointment-scheduler' },
  };
}

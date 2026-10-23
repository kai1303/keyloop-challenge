import { connectionOptions } from './connection-options.js';

describe('connectionOptions', () => {
  it('requires a database URL', () => {
    expect(() => connectionOptions({})).toThrow('DATABASE_URL is required');
  });

  it('accepts a local PostgreSQL fixture without TLS', () => {
    const result = connectionOptions({
      DATABASE_URL:
        'postgresql://scheduler_test:test@127.0.0.1:54329/scheduler_test',
    });
    expect(result).toMatchObject({
      type: 'postgres',
      synchronize: false,
      logging: false,
      ssl: false,
    });
  });

  it('rejects a non-PostgreSQL URL', () => {
    expect(() =>
      connectionOptions({ DATABASE_URL: 'https://example.com' }),
    ).toThrow('Expected a PostgreSQL URL');
  });

  it('requires a CA certificate for a hosted connection', () => {
    expect(() =>
      connectionOptions({
        DATABASE_URL: 'postgresql://app:example@db.example.com/postgres',
      }),
    ).toThrow('PGSSLROOTCERT is required for hosted PostgreSQL');
  });
});

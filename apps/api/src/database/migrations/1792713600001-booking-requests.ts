import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BookingRequests1792713600001 implements MigrationInterface {
  name = 'BookingRequests1792713600001';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE scheduler.booking_requests (
      scope text NOT NULL,
      key uuid NOT NULL,
      request_hash text NOT NULL,
      response jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, key)
    )`);
    await runner.query(
      'ALTER TABLE scheduler.booking_requests ENABLE ROW LEVEL SECURITY',
    );
    await runner.query('REVOKE ALL ON scheduler.booking_requests FROM PUBLIC');
    await runner.query(`DO $$ DECLARE role_name text; BEGIN
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON scheduler.booking_requests FROM %I', role_name);
        END IF;
      END LOOP;
    END $$`);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE scheduler.booking_requests');
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class DropBookingRequests1792972800000 implements MigrationInterface {
  name = 'DropBookingRequests1792972800000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query('DROP TABLE public.booking_requests');
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`CREATE TABLE public.booking_requests (
      scope text NOT NULL,
      key uuid NOT NULL,
      request_hash text NOT NULL,
      response jsonb,
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (scope, key)
    )`);
    await runner.query('ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY');
    await runner.query('REVOKE ALL ON public.booking_requests FROM PUBLIC');
    await runner.query(`DO $$ DECLARE role_name text; BEGIN
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON public.booking_requests FROM %I', role_name);
        END IF;
      END LOOP;
    END $$`);
  }
}

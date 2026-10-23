import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PrivateMigrationHistory1792627200004 implements MigrationInterface {
  name = 'PrivateMigrationHistory1792627200004';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      REVOKE ALL ON public.appointment_scheduler_migrations FROM PUBLIC;
      REVOKE ALL ON SEQUENCE public.appointment_scheduler_migrations_id_seq FROM PUBLIC;
      DO $permissions$
      DECLARE role_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
          IF EXISTS (SELECT FROM pg_roles WHERE rolname = role_name) THEN
            EXECUTE format('REVOKE ALL ON public.appointment_scheduler_migrations FROM %I', role_name);
            EXECUTE format('REVOKE ALL ON SEQUENCE public.appointment_scheduler_migrations_id_seq FROM %I', role_name);
          END IF;
        END LOOP;
      END;
      $permissions$;
    `);
  }

  down(): Promise<void> {
    // Rolling back application migrations must not expose migration metadata.
    return Promise.resolve();
  }
}

import type { MigrationInterface, QueryRunner } from 'typeorm';

export class PublicSchema1792800000000 implements MigrationInterface {
  name = 'PublicSchema1792800000000';

  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      DO $merge$
      DECLARE
        item record;
        role_name text;
        table_name text;
      BEGIN
        FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
          IF EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
            EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', role_name);
          END IF;
        END LOOP;
        -- Keep stock vehicles and customer service vehicles as distinct models.
        IF to_regclass('scheduler.vehicles') IS NOT NULL THEN
          ALTER TABLE scheduler.vehicles RENAME TO booking_vehicles;
          FOR item IN SELECT indexname FROM pg_indexes
            WHERE schemaname='scheduler' AND tablename='booking_vehicles'
          LOOP
            EXECUTE format('ALTER INDEX scheduler.%I RENAME TO %I',
              item.indexname, replace(item.indexname, 'vehicles_', 'booking_vehicles_'));
          END LOOP;
        END IF;
        FOR item IN
          SELECT n.nspname, c.relname FROM pg_class c
          JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname IN ('scheduler','staff_auth') AND c.relkind='r'
          ORDER BY n.nspname, c.relname
        LOOP
          EXECUTE format('ALTER TABLE %I.%I SET SCHEMA public', item.nspname, item.relname);
        END LOOP;
        FOR item IN
          SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
          WHERE n.nspname IN ('scheduler','staff_auth')
        LOOP
          EXECUTE format('ALTER FUNCTION %I.%I(%s) SET SCHEMA public', item.nspname, item.proname, item.args);
          EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC', item.proname, item.args);
          FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
            IF EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
              EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM %I', item.proname, item.args, role_name);
            END IF;
          END LOOP;
        END LOOP;
        FOREACH table_name IN ARRAY ARRAY[
          'users','booking_vehicles','service_types','technicians','service_bays',
          'technician_service_types','service_bookings','resource_slots','booking_requests',
          'user','session','account','verification','jwks','rateLimit'
        ] LOOP
          IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
            EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);
            FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
              IF EXISTS (SELECT FROM pg_roles WHERE rolname=role_name) THEN
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
              END IF;
            END LOOP;
          END IF;
        END LOOP;
        -- Refuse unexpected remaining objects; never remove them with CASCADE.
        DROP SCHEMA IF EXISTS scheduler;
        DROP SCHEMA IF EXISTS staff_auth;
      END;
      $merge$;
      NOTIFY pgrst, 'reload schema';
    `);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error(
        'Schema rollback must preserve booking and staff data; restore from a verified backup',
      ),
    );
  }
}

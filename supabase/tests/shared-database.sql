-- Read-only checks; run after both Supabase CLI and TypeORM migrations.
\set ON_ERROR_STOP on
DO $test$
DECLARE
  relation text;
  role_name text;
BEGIN
  FOREACH relation IN ARRAY ARRAY[
    'public.vehicles', 'public.sales_leads', 'public.sales_lead_activities',
    'public.appointment_scheduler_migrations', 'public.booking_requests', 'public.users',
    'public.booking_vehicles', 'public.service_bookings', 'public.service_types',
    'public.service_bays',
    'public.technician_service_types', 'public.session',
    'public.account', 'public.jwks', 'public.verification', 'public."rateLimit"'
  ] LOOP
    IF to_regclass(relation) IS NULL THEN
      RAISE EXCEPTION 'Missing shared-database relation: %', relation;
    END IF;
  END LOOP;
  IF to_regclass('public.technicians') IS NOT NULL OR to_regclass('public."user"') IS NOT NULL THEN
    RAISE EXCEPTION 'Identity tables were not consolidated into public.users';
  END IF;
  IF to_regclass('public.resource_slots') IS NOT NULL THEN
    RAISE EXCEPTION 'Obsolete resource_slots table must be removed';
  END IF;
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname IN ('scheduler','staff_auth')) THEN
    RAISE EXCEPTION 'Application schemas were not consolidated into public';
  END IF;
  IF 'public.vehicles'::regclass = 'public.booking_vehicles'::regclass THEN
    RAISE EXCEPTION 'Inventory and customer vehicles must remain distinct';
  END IF;
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH relation IN ARRAY ARRAY['users','booking_vehicles','service_types','service_bays','technician_service_types','service_bookings','booking_requests','session','account','verification','jwks','rateLimit'] LOOP
      IF has_table_privilege(role_name, format('public.%I',relation), 'SELECT,INSERT,UPDATE,DELETE')
        OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid=format('public.%I',relation)::regclass) THEN
        RAISE EXCEPTION 'Moved table % must have RLS and deny browser role %', relation, role_name;
      END IF;
    END LOOP;
    IF has_table_privilege(role_name, 'public.service_bookings', 'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(role_name, 'public.appointment_scheduler_migrations', 'SELECT,INSERT,UPDATE,DELETE')
      OR has_sequence_privilege(role_name, 'public.appointment_scheduler_migrations_id_seq', 'USAGE,SELECT,UPDATE')
      OR has_table_privilege(role_name, 'public.sales_leads', 'SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(role_name, 'public.sales_lead_activities', 'SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Private application or migration data is accessible to %', role_name;
    END IF;
  END LOOP;
  IF has_table_privilege('anon', 'public.vehicles', 'SELECT') OR has_table_privilege('authenticated', 'public.vehicles', 'SELECT') THEN
    RAISE EXCEPTION 'Inventory reads must use the authenticated NestJS API';
  END IF;
  IF NOT EXISTS (
    SELECT FROM pg_trigger WHERE tgrelid='public.service_bookings'::regclass
      AND tgname='booking_availability_changed' AND tgenabled='O'
  ) OR to_regprocedure('realtime.send(jsonb,text,text,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Appointment availability Broadcast is not installed';
  END IF;
END;
$test$;

CREATE SCHEMA scheduler;
REVOKE ALL ON SCHEMA scheduler FROM PUBLIC;

CREATE TABLE scheduler.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL CHECK (length(btrim(name)) > 0),
  email varchar(254) NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND length(email) > 0),
  phone_number varchar(30) NOT NULL CHECK (length(btrim(phone_number)) > 0)
);
CREATE TABLE scheduler.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES scheduler.users(id),
  registration_number varchar(32) NOT NULL CHECK (length(btrim(registration_number)) > 0),
  UNIQUE (user_id, registration_number)
);
CREATE TABLE scheduler.service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0)
);
CREATE TABLE scheduler.service_bays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL
);
CREATE TABLE scheduler.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(100) NOT NULL
);
CREATE TABLE scheduler.technician_service_types (
  technician_id uuid NOT NULL REFERENCES scheduler.technicians(id),
  service_type_id uuid NOT NULL REFERENCES scheduler.service_types(id),
  PRIMARY KEY (technician_id, service_type_id)
);
CREATE TABLE scheduler.service_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES scheduler.users(id),
  vehicle_id uuid NOT NULL REFERENCES scheduler.vehicles(id),
  service_type_id uuid NOT NULL REFERENCES scheduler.service_types(id),
  technician_id uuid NOT NULL REFERENCES scheduler.technicians(id),
  service_bay_id uuid NOT NULL REFERENCES scheduler.service_bays(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'CONFIRMED' CHECK (status = 'CONFIRMED'),
  submitted_name varchar(100) NOT NULL,
  submitted_email varchar(254) NOT NULL,
  submitted_phone_number varchar(30) NOT NULL,
  CHECK (isfinite(starts_at) AND isfinite(ends_at) AND ends_at > starts_at)
);
CREATE INDEX booking_technician_interval ON scheduler.service_bookings
  (technician_id, starts_at, ends_at) WHERE status = 'CONFIRMED';
CREATE INDEX booking_bay_interval ON scheduler.service_bookings
  (service_bay_id, starts_at, ends_at) WHERE status = 'CONFIRMED';

DO $permissions$
DECLARE role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA scheduler FROM %I', role_name);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA scheduler FROM %I', role_name);
    END IF;
  END LOOP;
END;
$permissions$;

CREATE TABLE public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration text NOT NULL UNIQUE CHECK (length(btrim(registration)) BETWEEN 1 AND 32),
  make text NOT NULL CHECK (length(btrim(make)) BETWEEN 1 AND 80),
  model text NOT NULL CHECK (length(btrim(model)) BETWEEN 1 AND 80),
  model_year integer NOT NULL CHECK (model_year BETWEEN 1886 AND 2100),
  price_pence integer NOT NULL CHECK (price_pence >= 0),
  stocked_on date NOT NULL CHECK (stocked_on <= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date),
  current_action text CHECK (current_action IN ('Price Reduction Planned','Marketing Push Planned','Wholesale Review Planned','Monitor Stock')),
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  action_updated_at timestamptz,
  version integer NOT NULL DEFAULT 0 CHECK (version >= 0),
  CHECK ((current_action IS NULL AND note IS NULL AND action_updated_at IS NULL)
      OR (current_action IS NOT NULL AND action_updated_at IS NOT NULL))
);
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.vehicles FROM anon, authenticated;
GRANT SELECT ON public.vehicles TO anon;
GRANT ALL ON public.vehicles TO service_role;
CREATE POLICY inventory_demo_read ON public.vehicles FOR SELECT TO anon USING (true);

CREATE FUNCTION public.save_inventory_action(
  p_id uuid, p_action text, p_note text, p_expected_version integer
) RETURNS SETOF public.vehicles
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $function$
DECLARE
  vehicle public.vehicles;
  today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('Price Reduction Planned','Marketing Push Planned','Wholesale Review Planned','Monitor Stock')
      OR p_expected_version IS NULL OR p_expected_version < 0
      OR char_length(btrim(coalesce(p_note,''))) > 1000 THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Invalid inventory action';
  END IF;
  SELECT * INTO vehicle FROM public.vehicles WHERE id=p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE SQLSTATE 'P0002' USING MESSAGE='Vehicle not found'; END IF;
  IF today - vehicle.stocked_on <= 90 THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Actions are available only for aging stock';
  END IF;
  IF vehicle.version <> p_expected_version THEN
    RAISE SQLSTATE '40001' USING MESSAGE='Vehicle action changed; review the latest version';
  END IF;
  RETURN QUERY UPDATE public.vehicles SET current_action=p_action,
    note=nullif(btrim(coalesce(p_note,'')),''), action_updated_at=now(), version=version+1
    WHERE id=p_id RETURNING *;
END;
$function$;
REVOKE ALL ON FUNCTION public.save_inventory_action(uuid,text,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_inventory_action(uuid,text,text,integer) TO service_role;

DO $publication$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='vehicles') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicles;
  END IF;
END;
$publication$;

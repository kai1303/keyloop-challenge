-- Run after the query migrations; owned fixtures and notifications roll back.
BEGIN;
INSERT INTO public.vehicles(registration,make,model,model_year,price_pence,stocked_on,current_action,note,action_updated_at)
SELECT 'PERF-OWNED-'||n,'Performance owned fixture',CASE WHEN n%2=0 THEN 'A' ELSE 'B' END,
  2022,(n%3)*100000,(now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (ARRAY[90,91,30,120,91,90,150,30,150,180,30,91])[n],
  CASE WHEN n IN (4,12) THEN 'Monitor Stock' END,NULL,CASE WHEN n IN (4,12) THEN now() END
FROM generate_series(1,12) n;
DO $test$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  spec jsonb; ordering text; r record; cursor_value jsonb; seen uuid[]; expected uuid[];
  n integer; rounds integer; meta jsonb;
BEGIN
  IF to_regclass('public.vehicles_vehicle_cursor_idx') IS NULL
    OR to_regclass('public.vehicles_vehicle_desc_cursor_idx') IS NULL
    OR to_regclass('public.vehicles_registration_cursor_idx') IS NULL
    OR to_regclass('public.vehicles_stock_action_idx') IS NULL THEN
    RAISE EXCEPTION 'Missing measured Inventory performance indexes';
  END IF;
  FOR spec,ordering IN SELECT * FROM (VALUES
    ('[{"key":"vehicle","direction":"asc"}]'::jsonb,'make COLLATE "C",model COLLATE "C",id'),
    ('[{"key":"vehicle","direction":"desc"}]'::jsonb,'make COLLATE "C" DESC,model COLLATE "C" DESC,id'),
    ('[{"key":"registration","direction":"desc"}]'::jsonb,'registration COLLATE "C" DESC,id'),
    ('[{"key":"currentAction","direction":"asc"}]'::jsonb,'coalesce(current_action,CASE WHEN $1-stocked_on>90 THEN ''Needs action'' ELSE ''No action required'' END) COLLATE "C",id'),
    ('[{"key":"currentAction","direction":"desc"},{"key":"pricePence","direction":"asc"}]'::jsonb,'coalesce(current_action,CASE WHEN $1-stocked_on>90 THEN ''Needs action'' ELSE ''No action required'' END) COLLATE "C" DESC,price_pence,id')
  ) sorts(spec,ordering) LOOP
    cursor_value:=NULL; seen:='{}'; rounds:=0;
    LOOP
      n:=0; rounds:=rounds+1;
      FOR r IN SELECT * FROM public.inventory_page(ARRAY['Performance owned fixture'],'{}','all','all',spec,cursor_value,3,today) LOOP
        n:=n+1;
        IF n<=3 THEN seen:=array_append(seen,(r.vehicle->>'id')::uuid); cursor_value:=r.cursor_values; END IF;
      END LOOP;
      EXIT WHEN n<=3;
      IF rounds>10 THEN RAISE EXCEPTION 'Nonterminating cursor traversal'; END IF;
    END LOOP;
    EXECUTE 'SELECT array_agg(id ORDER BY '||ordering||') FROM public.vehicles WHERE make=''Performance owned fixture'''
      INTO expected USING today;
    IF seen IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Ordering/cursor mismatch for %',spec; END IF;
  END LOOP;
  meta:=public.inventory_metadata();
  IF (meta->'summary'->>'total')::bigint<>(SELECT count(*) FROM public.vehicles)
    OR (meta->'summary'->>'aging')::bigint<>(SELECT count(*) FROM public.vehicles WHERE stocked_on<today-90)
    OR (meta->'summary'->>'needsAction')::bigint<>(SELECT count(*) FROM public.vehicles WHERE stocked_on<today-90 AND current_action IS NULL)
    OR meta->'options'->'Performance owned fixture' IS DISTINCT FROM '["A","B"]'::jsonb THEN
    RAISE EXCEPTION 'Metadata changed semantics';
  END IF;
  UPDATE public.vehicles SET current_action='Monitor Stock',action_updated_at=now()
    WHERE registration='PERF-OWNED-2';
  IF (public.inventory_metadata()->'summary'->>'needsAction')::bigint<>(meta->'summary'->>'needsAction')::bigint-1 THEN
    RAISE EXCEPTION 'Metadata did not reflect a fresh action write';
  END IF;
  IF has_function_privilege('anon','public.inventory_page(text[],text[],text,text,jsonb,jsonb,integer,date)','EXECUTE')
    OR has_function_privilege('authenticated','public.inventory_metadata()','EXECUTE') THEN
    RAISE EXCEPTION 'Inventory RPC permissions widened';
  END IF;
END;
$test$;
ROLLBACK;

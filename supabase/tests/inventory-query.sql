BEGIN;
INSERT INTO public.vehicles(registration,make,model,model_year,price_pence,stocked_on)
SELECT 'QUERY-OWNED-'||n, 'Query owned fixture',CASE WHEN n%2=0 THEN 'A' ELSE 'B' END,2022,(n%3)*100000,
  (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (ARRAY[0,30,31,60,61,90,91,120,91,120,90,30])[n]
FROM generate_series(1,12) n;
DO $test$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  r record; after_values jsonb; seen uuid[] := '{}'; expected uuid[]; n integer; rounds integer:=0;
BEGIN
  LOOP
    n:=0; rounds:=rounds+1;
    FOR r IN SELECT * FROM public.inventory_page(ARRAY['Query owned fixture'],'{}','all','all','[{"key":"daysInStock","direction":"desc"},{"key":"pricePence","direction":"desc"}]',after_values,3,today) LOOP
      n:=n+1;
      IF n<=3 THEN seen:=array_append(seen,(r.vehicle->>'id')::uuid); after_values:=r.cursor_values; END IF;
    END LOOP;
    EXIT WHEN n<=3;
    IF rounds>10 THEN RAISE EXCEPTION 'Cursor loop did not terminate'; END IF;
  END LOOP;
  SELECT array_agg(id ORDER BY stocked_on ASC,price_pence DESC,id ASC) INTO expected FROM public.vehicles WHERE make='Query owned fixture';
  IF seen IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Multi-sort cursor traversal differs from SQL order'; END IF;
  IF (SELECT count(*) FROM public.inventory_page(ARRAY['Query owned fixture'],'{}','aging','all','[{"key":"pricePence","direction":"asc"}]',null,100,today))<>4 THEN RAISE EXCEPTION '90/91-day boundary failed'; END IF;
  IF (SELECT count(*) FROM public.inventory_page(ARRAY['Query owned fixture'],ARRAY['A'],'aging','needsAction','[{"key":"vehicle","direction":"desc"}]',null,100,today))<>2 THEN RAISE EXCEPTION 'Combined make/model/age/action filters failed'; END IF;
  IF (public.inventory_metadata()->'summary'->>'total')::bigint<>(SELECT count(*) FROM public.vehicles) THEN RAISE EXCEPTION 'Global summary became page dependent'; END IF;
  IF NOT (public.inventory_metadata()->'options' ? 'Query owned fixture') THEN RAISE EXCEPTION 'Options do not span all rows'; END IF;
  IF has_function_privilege('anon','public.inventory_page(text[],text[],text,text,jsonb,jsonb,integer,date)','EXECUTE') OR has_function_privilege('anon','public.inventory_metadata()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous RPC execution was granted'; END IF;
END;
$test$;
ROLLBACK;

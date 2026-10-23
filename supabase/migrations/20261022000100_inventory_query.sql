CREATE INDEX IF NOT EXISTS vehicles_stock_cursor_idx ON public.vehicles (stocked_on, id);
CREATE INDEX IF NOT EXISTS vehicles_price_cursor_idx ON public.vehicles (price_pence, id);
CREATE INDEX IF NOT EXISTS vehicles_make_price_cursor_idx ON public.vehicles (make, price_pence, id);
CREATE INDEX IF NOT EXISTS vehicles_make_model_idx ON public.vehicles (make, model);

CREATE OR REPLACE FUNCTION public.inventory_page(
  p_make text[], p_model text[], p_age text, p_action text,
  p_sort jsonb, p_after jsonb, p_limit integer, p_today date
) RETURNS TABLE(vehicle jsonb, cursor_values jsonb)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
DECLARE
  spec jsonb; k text; d text; i integer;
  expressions text[] := '{}'; casts text[] := '{}'; directions text[] := '{}';
  ordering text[] := '{}'; seek text[] := '{}'; targets text[] := '{}'; prefix text := ''; filters text := 'true';
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 100 OR p_today IS NULL
    OR p_make IS NULL OR p_model IS NULL OR cardinality(p_make)>20 OR cardinality(p_model)>20
    OR p_sort IS NULL OR jsonb_typeof(p_sort)<>'array' OR jsonb_array_length(p_sort) NOT BETWEEN 1 AND 3 THEN
    RAISE SQLSTATE '22023' USING MESSAGE='Invalid inventory query';
  END IF;
  FOR spec IN SELECT value FROM jsonb_array_elements(p_sort) LOOP
    k := spec->>'key'; d := upper(spec->>'direction');
    IF d IS NULL OR d NOT IN ('ASC','DESC') THEN RAISE SQLSTATE '22023'; END IF;
    CASE k
      WHEN 'vehicle' THEN expressions:=expressions || ARRAY['v.make COLLATE "C"','v.model COLLATE "C"']; casts:=casts || ARRAY['text','text']; directions:=directions || ARRAY[d,d];
      WHEN 'registration' THEN expressions:=array_append(expressions,'v.registration COLLATE "C"'); casts:=array_append(casts,'text'); directions:=array_append(directions,d);
      WHEN 'pricePence' THEN expressions:=array_append(expressions,'v.price_pence'); casts:=array_append(casts,'integer'); directions:=array_append(directions,d);
      WHEN 'daysInStock' THEN expressions:=array_append(expressions,'v.stocked_on'); casts:=array_append(casts,'date'); directions:=array_append(directions,CASE WHEN d='ASC' THEN 'DESC' ELSE 'ASC' END);
      WHEN 'currentAction' THEN expressions:=array_append(expressions,'coalesce(v.current_action, CASE WHEN $2 - v.stocked_on > 90 THEN ''Needs action'' ELSE ''No action required'' END) COLLATE "C"'); casts:=array_append(casts,'text'); directions:=array_append(directions,d);
      ELSE RAISE SQLSTATE '22023' USING MESSAGE='Invalid inventory sort';
    END CASE;
  END LOOP;
  expressions:=array_append(expressions,'v.id'); casts:=array_append(casts,'uuid'); directions:=array_append(directions,'ASC');
  IF p_after IS NOT NULL AND (jsonb_typeof(p_after)<>'array' OR jsonb_array_length(p_after)<>cardinality(expressions)) THEN RAISE SQLSTATE '22023'; END IF;
  FOR i IN 1..cardinality(expressions) LOOP
    ordering:=array_append(ordering,expressions[i] || ' ' || directions[i]);
    targets:=array_append(targets,format('($6->>%s)::%s',i-1,casts[i]));
    seek:=array_append(seek,prefix || format('%s %s ($6->>%s)::%s',expressions[i],CASE WHEN directions[i]='ASC' THEN '>' ELSE '<' END,i-1,casts[i]));
    prefix:=prefix || format('%s = ($6->>%s)::%s AND ',expressions[i],i-1,casts[i]);
  END LOOP;
  IF cardinality(p_make)>0 THEN filters:=filters || ' AND v.make=ANY($3)'; END IF;
  IF cardinality(p_model)>0 THEN filters:=filters || ' AND v.model=ANY($4)'; END IF;
  CASE p_age
    WHEN 'all' THEN NULL;
    WHEN 'aging' THEN filters:=filters || ' AND v.stocked_on < $2 - 90';
    WHEN '0-30' THEN filters:=filters || ' AND v.stocked_on BETWEEN $2 - 30 AND $2';
    WHEN '31-60' THEN filters:=filters || ' AND v.stocked_on BETWEEN $2 - 60 AND $2 - 31';
    WHEN '61-90' THEN filters:=filters || ' AND v.stocked_on BETWEEN $2 - 90 AND $2 - 61';
    ELSE RAISE SQLSTATE '22023';
  END CASE;
  IF p_action='needsAction' THEN filters:=filters || ' AND v.current_action IS NULL AND v.stocked_on < $2 - 90';
  ELSIF p_action<>'all' THEN filters:=filters || ' AND v.current_action=$5'; END IF;
  IF p_after IS NOT NULL THEN
    IF array_position(directions,'DESC') IS NULL THEN
      filters:=filters || ' AND (' || array_to_string(expressions,',') || ') > (' || array_to_string(targets,',') || ')';
    ELSE
      filters:=filters || ' AND ((' || array_to_string(seek,') OR (') || '))';
    END IF;
  END IF;
  RETURN QUERY EXECUTE 'SELECT to_jsonb(v), jsonb_build_array(' || array_to_string(expressions,',') || ') FROM public.vehicles v WHERE ' || filters || ' ORDER BY ' || array_to_string(ordering,',') || ' LIMIT $1'
    USING p_limit+1,p_today,p_make,p_model,p_action,p_after;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.inventory_metadata() RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $fn$
  SELECT jsonb_build_object(
    'summary',(SELECT jsonb_build_object('total',count(*),'aging',count(*) FILTER(WHERE stocked_on < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 90),'needsAction',count(*) FILTER(WHERE current_action IS NULL AND stocked_on < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 90)) FROM public.vehicles),
    'options',coalesce((SELECT jsonb_object_agg(make,models) FROM (
      SELECT make,jsonb_agg(model ORDER BY model COLLATE "C") AS models FROM (SELECT DISTINCT make,model FROM public.vehicles) variants GROUP BY make
    ) groups),'{}'::jsonb)
  );
$fn$;
REVOKE ALL ON FUNCTION public.inventory_page(text[],text[],text,text,jsonb,jsonb,integer,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_page(text[],text[],text,text,jsonb,jsonb,integer,date) TO service_role;
REVOKE ALL ON FUNCTION public.inventory_metadata() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.inventory_metadata() TO service_role;

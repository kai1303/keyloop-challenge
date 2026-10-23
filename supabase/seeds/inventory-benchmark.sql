-- Manual local-only seed; never include in startup or migrations.
-- Run from the repository root:
-- docker exec -i supabase_db_keyloop-inventory-local psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < supabase/seeds/inventory-benchmark.sql
-- Owned rows have BOTH the b1000000-0000-4000-8000- UUID prefix and KL-BENCH- registration prefix.
BEGIN;
SET LOCAL statement_timeout = '10min';
LOCK TABLE public.vehicles IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE inventory_before ON COMMIT DROP AS
SELECT * FROM public.vehicles
WHERE NOT (id::text LIKE 'b1000000-0000-4000-8000-%' AND registration LIKE 'KL-BENCH-%');

DO $check$
BEGIN
  IF (SELECT count(*) FROM inventory_before) > 1000000 THEN
    RAISE EXCEPTION 'Existing inventory already exceeds the target; nothing was changed';
  END IF;
END;
$check$;

WITH samples AS (
  SELECT n, (n * 37) % 100 AS variant, (n * 97) % 731 AS days,
    ((n / 100) % 3)::integer + 1 AS model_index,
    (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today
  FROM generate_series(1, (1000000 - (SELECT count(*) FROM inventory_before))::integer) n
), variants AS (
  SELECT *, CASE
    WHEN variant < 30 THEN 1 WHEN variant < 50 THEN 2 WHEN variant < 60 THEN 3
    WHEN variant < 68 THEN 4 WHEN variant < 74 THEN 5 WHEN variant < 80 THEN 6
    WHEN variant < 85 THEN 7 WHEN variant < 89 THEN 8 WHEN variant < 93 THEN 9
    WHEN variant < 96 THEN 10 WHEN variant < 98 THEN 11 ELSE 12 END AS make_index
  FROM samples
), rows AS (
  SELECT *, CASE make_index
    WHEN 1 THEN (ARRAY['Corolla','Yaris','RAV4'])[model_index]
    WHEN 2 THEN (ARRAY['Focus','Kuga','Puma'])[model_index]
    WHEN 3 THEN (ARRAY['3 Series','X1','X3'])[model_index]
    WHEN 4 THEN (ARRAY['Golf','Polo','Tiguan'])[model_index]
    WHEN 5 THEN (ARRAY['A3','A4','Q5'])[model_index]
    WHEN 6 THEN (ARRAY['A-Class','C-Class','GLC'])[model_index]
    WHEN 7 THEN (ARRAY['Civic','Jazz','CR-V'])[model_index]
    WHEN 8 THEN (ARRAY['Qashqai','Juke','Leaf'])[model_index]
    WHEN 9 THEN (ARRAY['i10','i30','Tucson'])[model_index]
    WHEN 10 THEN (ARRAY['Ceed','Sportage','EV6'])[model_index]
    WHEN 11 THEN (ARRAY['Model 3','Model Y','Model S'])[model_index]
    ELSE (ARRAY['XC40','XC60','V60'])[model_index] END AS model_name,
    CASE WHEN days > 90 AND n % 5 IN (1,2)
      THEN (ARRAY['Price Reduction Planned','Marketing Push Planned','Wholesale Review Planned','Monitor Stock'])[1 + n % 4]
    END AS action
  FROM variants
)
INSERT INTO public.vehicles
  (id, registration, make, model, model_year, price_pence, stocked_on,
   current_action, note, action_updated_at)
SELECT ('b1000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
  'KL-BENCH-' || lpad(n::text,8,'0'),
  (ARRAY['Toyota','Ford','BMW','Volkswagen','Audi','Mercedes-Benz','Honda','Nissan','Hyundai','Kia','Tesla','Volvo'])[make_index],
  model_name, 2015 + n % 12,
  (500000 + ((n::bigint * 7919) % 8500000) / 1000 * 1000)::integer,
  today - days, action,
  CASE WHEN action IS NOT NULL THEN 'Synthetic inventory benchmark vehicle.' END,
  CASE WHEN action IS NOT NULL THEN now() END
FROM rows
ON CONFLICT (id) DO NOTHING;

DO $check$
BEGIN
  IF (SELECT count(*) FROM public.vehicles) <> 1000000 THEN
    RAISE EXCEPTION 'Expected exactly 1000000 vehicles; rolling back';
  END IF;
  IF EXISTS (SELECT * FROM inventory_before EXCEPT SELECT * FROM public.vehicles)
    OR EXISTS (
      SELECT * FROM public.vehicles
      WHERE NOT (id::text LIKE 'b1000000-0000-4000-8000-%' AND registration LIKE 'KL-BENCH-%')
      EXCEPT SELECT * FROM inventory_before
    ) THEN
    RAISE EXCEPTION 'Existing inventory changed; rolling back';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.vehicles
    WHERE id::text LIKE 'b1000000-0000-4000-8000-%' AND registration LIKE 'KL-BENCH-%'
      AND current_action IS NOT NULL
      AND stocked_on >= (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 90
  ) THEN
    RAISE EXCEPTION 'Seeded an action on non-aging stock; rolling back';
  END IF;
END;
$check$;
COMMIT;

-- Give the query planner current statistics before a separate benchmark run.
ANALYZE public.vehicles;
SELECT jsonb_build_object(
  'total', count(*),
  'synthetic', count(*) FILTER (WHERE id::text LIKE 'b1000000-0000-4000-8000-%' AND registration LIKE 'KL-BENCH-%'),
  'aging', count(*) FILTER (WHERE stocked_on < (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 90),
  'withAction', count(*) FILTER (WHERE current_action IS NOT NULL),
  'makes', count(DISTINCT make),
  'makeModelPairs', count(DISTINCT (make,model)),
  'sizeBytes', pg_total_relation_size('public.vehicles')
) AS seed_result FROM public.vehicles;

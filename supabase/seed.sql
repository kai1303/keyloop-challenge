WITH samples AS (
  SELECT n, (n-1)%6 AS variant,
    (ARRAY[0,12,30,31,60,61,90,91,120,150,180,210])[1+(n-1)%12] AS days
  FROM generate_series(1,24) AS n
)
INSERT INTO public.vehicles(id,registration,make,model,model_year,price_pence,stocked_on,current_action,note,action_updated_at)
SELECT ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'KL-DEMO-'||lpad(n::text,3,'0'),
  CASE WHEN variant<2 THEN 'Toyota' WHEN variant<4 THEN 'BMW' ELSE 'Ford' END,
  (ARRAY['Corolla','Yaris','3 Series','X1','Focus','Kuga'])[variant+1],
  2020+n%5, 1500000+n*50000,
  (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date-days,
  CASE WHEN days>90 AND n%4=0 THEN 'Price Reduction Planned' END,
  CASE WHEN days>90 AND n%4=0 THEN 'Review pricing at the next stock meeting.' END,
  CASE WHEN days>90 AND n%4=0 THEN now() END
FROM samples
ON CONFLICT (id) DO NOTHING;

BEGIN;
DO $test$
DECLARE
  today date := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  target uuid := 'ffffffff-ffff-4fff-8fff-000000000001';
  young uuid := 'ffffffff-ffff-4fff-8fff-000000000002';
  saved public.vehicles;
BEGIN
  INSERT INTO public.vehicles(id,registration,make,model,model_year,price_pence,stocked_on)
  VALUES (target,'TEST-INVENTORY-91','Toyota','Corolla',2022,1800000,today-91),
         (young,'TEST-INVENTORY-90','Toyota','Yaris',2023,1600000,today-90);
  SELECT * INTO saved FROM public.save_inventory_action(target,'Price Reduction Planned','  Review Friday  ',0);
  ASSERT saved.current_action = 'Price Reduction Planned';
  ASSERT saved.note = 'Review Friday';
  ASSERT saved.version = 1 AND saved.action_updated_at IS NOT NULL;
  BEGIN
    PERFORM public.save_inventory_action(target,'Monitor Stock',NULL,0);
    RAISE EXCEPTION 'stale version was accepted';
  EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action(young,'Monitor Stock',NULL,0);
    RAISE EXCEPTION '90-day vehicle was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action(target,'Unsupported action',NULL,1);
    RAISE EXCEPTION 'unknown action was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action(target,'Monitor Stock',repeat('x',1001),1);
    RAISE EXCEPTION 'oversized note was accepted';
  EXCEPTION WHEN SQLSTATE '22023' THEN NULL;
  END;
  BEGIN
    PERFORM public.save_inventory_action('ffffffff-ffff-4fff-8fff-000000000099','Monitor Stock',NULL,0);
    RAISE EXCEPTION 'missing vehicle was accepted';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN NULL;
  END;
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid='public.vehicles'::regclass);
  ASSERT NOT has_table_privilege('anon','public.vehicles','SELECT');
  ASSERT NOT has_table_privilege('anon','public.vehicles','UPDATE');
  ASSERT NOT has_table_privilege('anon','public.vehicles','INSERT');
  ASSERT NOT has_table_privilege('anon','public.vehicles','DELETE');
  ASSERT NOT has_function_privilege('anon','public.save_inventory_action(uuid,text,text,integer)','EXECUTE');
  ASSERT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='inventory_changed' AND tgrelid='public.vehicles'::regclass AND tgenabled='O');
END;
$test$;
ROLLBACK;

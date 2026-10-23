-- Better Auth staff identities are enforced by NestJS; no browser reads bypass it.
DROP POLICY inventory_demo_read ON public.vehicles;
REVOKE ALL ON public.vehicles FROM anon, authenticated;
ALTER PUBLICATION supabase_realtime DROP TABLE public.vehicles;

CREATE FUNCTION public.broadcast_inventory_change() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $function$
BEGIN
  PERFORM realtime.send('{}'::jsonb, 'inventory_changed', 'inventory', false);
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.broadcast_inventory_change() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER inventory_changed AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
FOR EACH STATEMENT EXECUTE FUNCTION public.broadcast_inventory_change();

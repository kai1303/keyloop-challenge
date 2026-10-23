CREATE OR REPLACE FUNCTION scheduler.broadcast_availability_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  zone text := current_setting('scheduler.timezone', true);
  previous_date text;
  next_date text;
BEGIN
  IF zone IS NULL OR zone = '' THEN
    RAISE EXCEPTION 'scheduler.timezone must be set inside the booking transaction';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    previous_date := to_char(OLD.starts_at AT TIME ZONE zone, 'YYYY-MM-DD');
  END IF;
  IF TG_OP <> 'DELETE' THEN
    next_date := to_char(NEW.starts_at AT TIME ZONE zone, 'YYYY-MM-DD');
  END IF;
  IF previous_date IS NOT NULL THEN
    PERFORM realtime.send(
      jsonb_build_object('date', previous_date),
      'availability_changed', 'availability:' || previous_date, false
    );
  END IF;
  IF next_date IS NOT NULL AND next_date IS DISTINCT FROM previous_date THEN
    PERFORM realtime.send(
      jsonb_build_object('date', next_date),
      'availability_changed', 'availability:' || next_date, false
    );
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION scheduler.broadcast_availability_change() FROM PUBLIC;

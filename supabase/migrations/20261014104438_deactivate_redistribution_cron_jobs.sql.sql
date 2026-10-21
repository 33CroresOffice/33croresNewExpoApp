-- Try owner postgres with SECURITY DEFINER; postgres might have UPDATE via grant not direct.
CREATE OR REPLACE FUNCTION public.deactivate_redistribution_cron_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'cron', 'public'
AS $function$
DECLARE
  v_updated int;
BEGIN
  UPDATE job SET active = false
  WHERE jobname IN ('retry-unassigned-relaxed','nightly-leave-redistribution','no-show-detection-615am');
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('updated', v_updated);
END;
$function$;

ALTER FUNCTION public.deactivate_redistribution_cron_jobs() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.deactivate_redistribution_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.deactivate_redistribution_cron_jobs() TO postgres;

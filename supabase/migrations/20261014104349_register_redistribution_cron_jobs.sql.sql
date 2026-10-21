-- Admin-visible registration of redistribution cron jobs (inactive by default).
-- cron.job is owned by supabase_admin, so a SECURITY DEFINER function owned by
-- postgres (which has cron admin rights in this project) does the insert.
CREATE OR REPLACE FUNCTION public.register_redistribution_cron_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'cron', 'public'
AS $function$
DECLARE
  v_result jsonb := '{}'::jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM job WHERE jobname = 'retry-unassigned-relaxed') THEN
    INSERT INTO job (jobname, schedule, command, active)
    VALUES ('retry-unassigned-relaxed', '0 19 * * *',
            'SELECT public.retry_unassigned_relaxed(CURRENT_DATE + 1);', false);
  END IF;
  v_result := v_result || jsonb_build_object('retry-unassigned-relaxed',
    (SELECT active FROM job WHERE jobname = 'retry-unassigned-relaxed'));

  IF NOT EXISTS (SELECT 1 FROM job WHERE jobname = 'nightly-leave-redistribution') THEN
    INSERT INTO job (jobname, schedule, command, active)
    VALUES ('nightly-leave-redistribution', '30 16 * * *',
            'SELECT public.redistribute_planned_leave(CURRENT_DATE + 1);', false);
  END IF;
  v_result := v_result || jsonb_build_object('nightly-leave-redistribution',
    (SELECT active FROM job WHERE jobname = 'nightly-leave-redistribution'));

  IF NOT EXISTS (SELECT 1 FROM job WHERE jobname = 'no-show-detection-615am') THEN
    INSERT INTO job (jobname, schedule, command, active)
    VALUES ('no-show-detection-615am', '45 0 * * *',
            'SELECT public.redistribute_no_shows(CURRENT_DATE);', false);
  END IF;
  v_result := v_result || jsonb_build_object('no-show-detection-615am',
    (SELECT active FROM job WHERE jobname = 'no-show-detection-615am'));

  RETURN v_result;
END;
$function$;

-- Reassign to postgres (same owner as admin_run_cron_job family) so it can write cron.job
ALTER FUNCTION public.register_redistribution_cron_jobs() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.register_redistribution_cron_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.register_redistribution_cron_jobs() TO postgres;

/*
  # Sync cron_job_definitions with actual cron.job entries

  1. Adds a function `sync_cron_job_definitions()` that inserts any
     cron.job entries not already in cron_job_definitions, with a
     default purpose derived from the job name.
  2. Runs the sync immediately so all 16 active jobs are represented.
  3. Does NOT create any new cron schedules.
*/

CREATE OR REPLACE FUNCTION sync_cron_job_definitions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  INSERT INTO cron_job_definitions (job_name, purpose, schedule, job_type, sort_order)
  SELECT
    j.jobname,
    REPLACE(REPLACE(j.jobname, '-', ' '), '_', ' '),
    j.schedule,
    CASE WHEN j.command LIKE '%net.http_post%' THEN 'edge_function' ELSE 'sql' END,
    100
  FROM cron.job j
  WHERE NOT EXISTS (
    SELECT 1 FROM cron_job_definitions d WHERE d.job_name = j.jobname
  )
  AND j.active = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE cron_job_definitions d
  SET schedule = j.schedule, is_active = j.active, updated_at = now()
  FROM cron.job j
  WHERE d.job_name = j.jobname
  AND (d.schedule <> j.schedule OR d.is_active <> j.active);

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION sync_cron_job_definitions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION sync_cron_job_definitions() TO authenticated;

SELECT sync_cron_job_definitions();

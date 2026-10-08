/*
# Make Cron Monitor reflect the live scheduler

1. Purpose
- Make the Cron Monitor read directly from `cron.job`, so every active or inactive scheduled job registered in pg_cron appears automatically.
- Keep human-written metadata from `cron_job_definitions` when it exists.
- Generate a readable fallback purpose for newly added jobs that do not yet have metadata.

2. Monitoring fields
- `purpose`: human-readable purpose from the metadata table or a generated fallback.
- `job_type`: SQL or Edge Function based on the scheduled command.
- `run_count`: total recorded executions for the job.
- Existing last-run fields and live active state remain available.

3. History
- Correct `get_cron_job_run_history` so the requested limit is applied before aggregation.

4. Security
- Existing admin authorization is preserved for all SECURITY DEFINER functions.
- No tables, user data, or existing scheduled jobs are deleted or changed.

5. Important notes
- The live scheduler is now the source of truth for the monitor list.
- A newly registered pg_cron job appears on the monitor automatically the next time the page loads or refreshes.
*/

CREATE OR REPLACE FUNCTION get_cron_job_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_result jsonb := '[]'::jsonb;
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(row_data ORDER BY job_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'jobid', j.jobid,
        'job_name', j.jobname,
        'purpose', COALESCE(
          d.purpose,
          'Runs the scheduled ' || replace(initcap(replace(j.jobname, '-', ' ')), '_', ' ') || ' task'
        ),
        'schedule', j.schedule,
        'job_type', CASE WHEN j.command LIKE '%net.http_post%' THEN 'edge_function' ELSE 'sql' END,
        'automation_name', d.automation_name,
        'sort_order', COALESCE(d.sort_order, 1000),
        'active', j.active,
        'last_run_start', r.start_time,
        'last_run_end', r.end_time,
        'last_run_status', r.status,
        'last_run_duration_ms', CASE WHEN r.start_time IS NOT NULL AND r.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (r.end_time - r.start_time)) * 1000 ELSE NULL END,
        'last_run_return', r.return_message,
        'last_error', CASE WHEN r.status = 1 THEN r.return_message ELSE NULL END,
        'run_count', COALESCE(rc.run_count, 0)
      ) AS row_data,
      j.jobname AS job_name
    FROM cron.job j
    LEFT JOIN public.cron_job_definitions d ON d.job_name = j.jobname
    LEFT JOIN LATERAL (
      SELECT rd.start_time, rd.end_time, rd.status, rd.return_message
      FROM cron.job_run_details rd
      WHERE rd.jobid = j.jobid
      ORDER BY rd.runid DESC
      LIMIT 1
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS run_count
      FROM cron.job_run_details rd
      WHERE rd.jobid = j.jobid
    ) rc ON true
  ) live_jobs;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_cron_job_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_cron_job_status() TO authenticated;

CREATE OR REPLACE FUNCTION get_cron_job_run_history(p_job_name text, p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_is_admin boolean;
  v_result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(history_row ORDER BY runid DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      rd.runid,
      jsonb_build_object(
        'runid', rd.runid,
        'job_name', j.jobname,
        'start_time', rd.start_time,
        'end_time', rd.end_time,
        'status', CASE rd.status WHEN 0 THEN 'starting' WHEN 1 THEN 'failed' WHEN 2 THEN 'succeeded' WHEN 3 THEN 'timeout' ELSE 'unknown' END,
        'duration_ms', CASE WHEN rd.start_time IS NOT NULL AND rd.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (rd.end_time - rd.start_time)) * 1000 ELSE NULL END,
        'return_message', rd.return_message
      ) AS history_row
    FROM cron.job_run_details rd
    JOIN cron.job j ON j.jobid = rd.jobid
    WHERE j.jobname = p_job_name
    ORDER BY rd.runid DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  ) limited_history;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_cron_job_run_history(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_cron_job_run_history(text, integer) TO authenticated;
/*
# Record manual Cron Monitor runs

1. Purpose
- Record every admin-triggered Run Now attempt separately from pg_cron’s scheduled history.
- Include both successful and failed manual attempts in the Cron Monitor execution history.
- Make the latest-run status and total run count include manual executions.

2. New table
- `cron_manual_run_logs`
- `id`: unique identifier for the manual attempt.
- `job_name`: scheduled job that was manually triggered.
- `started_at`: time the manual command began.
- `ended_at`: time the manual command completed.
- `status`: `running`, `succeeded`, or `failed`.
- `return_message`: completion detail or the actual error message.
- `triggered_by`: admin account that started the run.
- `created_at`: record creation time.

3. Modified functions
- `admin_run_cron_job()` creates and completes a manual-run record around the command execution.
- `get_cron_job_status()` includes manual runs in latest status and total run counts.
- `get_cron_job_run_history()` combines scheduled and manual executions and labels their source.

4. Security
- RLS is enabled on `cron_manual_run_logs`.
- Four separate admin-only policies protect select, insert, update, and delete access.
- Public and anonymous access is revoked; the SECURITY DEFINER functions remain admin-authorized.

5. Important notes
- Existing scheduled history is preserved.
- This does not create, remove, or alter any scheduled jobs.
- Every manual attempt is visible in history, including an error from the job itself.
*/

CREATE TABLE IF NOT EXISTS public.cron_manual_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ended_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'failed')),
  return_message text,
  triggered_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cron_manual_run_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_cron_manual_run_logs" ON public.cron_manual_run_logs;
CREATE POLICY "admins_select_cron_manual_run_logs" ON public.cron_manual_run_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_insert_cron_manual_run_logs" ON public.cron_manual_run_logs;
CREATE POLICY "admins_insert_cron_manual_run_logs" ON public.cron_manual_run_logs
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_update_cron_manual_run_logs" ON public.cron_manual_run_logs;
CREATE POLICY "admins_update_cron_manual_run_logs" ON public.cron_manual_run_logs
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_delete_cron_manual_run_logs" ON public.cron_manual_run_logs;
CREATE POLICY "admins_delete_cron_manual_run_logs" ON public.cron_manual_run_logs
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

REVOKE ALL ON TABLE public.cron_manual_run_logs FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_run_cron_job(p_job_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_is_admin boolean;
  v_command text;
  v_jobid bigint;
  v_manual_run_id uuid;
  v_started_at timestamptz;
  v_error text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jobid, command INTO v_jobid, v_command
  FROM cron.job
  WHERE jobname = p_job_name AND active = true;

  IF v_command IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cron job not found or inactive');
  END IF;

  v_started_at := clock_timestamp();
  INSERT INTO public.cron_manual_run_logs (job_name, started_at, status, triggered_by)
  VALUES (p_job_name, v_started_at, 'running', auth.uid())
  RETURNING id INTO v_manual_run_id;

  BEGIN
    EXECUTE v_command;

    UPDATE public.cron_manual_run_logs
    SET ended_at = clock_timestamp(), status = 'succeeded', return_message = 'Completed successfully'
    WHERE id = v_manual_run_id;

    RETURN jsonb_build_object(
      'success', true,
      'job_name', p_job_name,
      'manual_run_id', v_manual_run_id,
      'message', 'Completed successfully'
    );
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_error = MESSAGE_TEXT;

    UPDATE public.cron_manual_run_logs
    SET ended_at = clock_timestamp(), status = 'failed', return_message = v_error
    WHERE id = v_manual_run_id;

    RETURN jsonb_build_object(
      'success', false,
      'job_name', p_job_name,
      'manual_run_id', v_manual_run_id,
      'error', v_error
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_run_cron_job(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_run_cron_job(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cron_job_status()
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
        'last_run_status', CASE r.status
          WHEN 'starting' THEN 0
          WHEN 'failed' THEN 1
          WHEN 'succeeded' THEN 2
          WHEN 'timeout' THEN 3
          WHEN 'running' THEN 0
          ELSE NULL
        END,
        'last_run_duration_ms', CASE WHEN r.start_time IS NOT NULL AND r.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (r.end_time - r.start_time)) * 1000 ELSE NULL END,
        'last_run_return', r.return_message,
        'last_error', CASE WHEN r.status = 'failed' THEN r.return_message ELSE NULL END,
        'run_count', COALESCE(rc.scheduled_count, 0) + COALESCE(rc.manual_count, 0)
      ) AS row_data,
      j.jobname AS job_name
    FROM cron.job j
    LEFT JOIN public.cron_job_definitions d ON d.job_name = j.jobname
    LEFT JOIN LATERAL (
      SELECT recent.start_time, recent.end_time, recent.status, recent.return_message
      FROM (
        SELECT rd.start_time, rd.end_time, rd.status, rd.return_message
        FROM cron.job_run_details rd
        WHERE rd.jobid = j.jobid
        UNION ALL
        SELECT ml.started_at, ml.ended_at, ml.status, ml.return_message
        FROM public.cron_manual_run_logs ml
        WHERE ml.job_name = j.jobname
      ) recent
      ORDER BY recent.start_time DESC NULLS LAST
      LIMIT 1
    ) r ON true
    LEFT JOIN LATERAL (
      SELECT
        (SELECT count(*)::integer FROM cron.job_run_details rd WHERE rd.jobid = j.jobid) AS scheduled_count,
        (SELECT count(*)::integer FROM public.cron_manual_run_logs ml WHERE ml.job_name = j.jobname) AS manual_count
    ) rc ON true
  ) live_jobs;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_job_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cron_job_status() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_cron_job_run_history(p_job_name text, p_limit integer DEFAULT 50)
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

  SELECT COALESCE(jsonb_agg(history_row ORDER BY start_time DESC NULLS LAST), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      rd.runid::text AS runid,
      rd.start_time,
      jsonb_build_object(
        'runid', rd.runid::text,
        'job_name', j.jobname,
        'start_time', rd.start_time,
        'end_time', rd.end_time,
        'status', rd.status,
        'source', 'scheduled',
        'duration_ms', CASE WHEN rd.start_time IS NOT NULL AND rd.end_time IS NOT NULL
          THEN EXTRACT(EPOCH FROM (rd.end_time - rd.start_time)) * 1000 ELSE NULL END,
        'return_message', rd.return_message
      ) AS history_row
    FROM cron.job_run_details rd
    JOIN cron.job j ON j.jobid = rd.jobid
    WHERE j.jobname = p_job_name

    UNION ALL

    SELECT
      ('manual-' || ml.id::text) AS runid,
      ml.started_at AS start_time,
      jsonb_build_object(
        'runid', ('manual-' || ml.id::text),
        'job_name', ml.job_name,
        'start_time', ml.started_at,
        'end_time', ml.ended_at,
        'status', ml.status,
        'source', 'manual',
        'duration_ms', CASE WHEN ml.started_at IS NOT NULL AND ml.ended_at IS NOT NULL
          THEN EXTRACT(EPOCH FROM (ml.ended_at - ml.started_at)) * 1000 ELSE NULL END,
        'return_message', ml.return_message
      ) AS history_row
    FROM public.cron_manual_run_logs ml
    WHERE ml.job_name = p_job_name

    ORDER BY start_time DESC NULLS LAST
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  ) limited_history;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_cron_job_run_history(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cron_job_run_history(text, integer) TO authenticated;
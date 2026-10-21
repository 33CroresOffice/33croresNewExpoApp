/*
# Cron Management: show ALL project cron jobs (scheduled + defined)

1. Purpose
- The Cron Management screen was driven only by jobs actually registered in the
  pg_cron scheduler (cron.job). The project defines 28 cron jobs in the
  `cron_job_definitions` table, but only 9 were registered in the scheduler, so
  19 jobs were invisible to admins.
- This migration makes the screen list the UNION of both sources: every job
  defined for the project plus any scheduler-only job, with no duplicates.
- Jobs that are defined but not yet registered in the scheduler appear with
  their intended schedule and an "Not scheduled" badge. Nothing starts running
  automatically until an admin activates it, so runtime behavior is unchanged.

2. New function
- `public.cron_command_for_definition(p_job_name text)` — SECURITY DEFINER
  helper that returns the runnable command for a job definition:
  - If the definition has an `automation_name`, the command runs that function
    (identifier safely quoted).
  - If the definition is an edge function job, the command posts to the
    matching Supabase Edge Function.
  - Returns NULL when no command can be derived. Execute privilege revoked
    from PUBLIC; only owner-side code (the admin RPCs) calls it.

3. Modified functions
- `public.get_cron_job_status()` — now returns one row per job from the union
  of `cron_job_definitions` (left-joined to `cron.job`) plus scheduler-only
  jobs. Live data (schedule, active flag, last run, run counts) always wins
  when a job is registered in the scheduler. Adds an `is_scheduled` field so
  the UI can distinguish "Paused" from "Not scheduled". Sorted by the
  definition's `sort_order`, then job name. Admin-only, as before.
- `public.admin_update_cron_job()` — when an admin activates a job that is not
  yet registered in the scheduler, the job is now registered automatically with
  its derived command (schedule from the edit or from the definition). Pausing
  a not-registered job is a safe no-op. All previous behavior for registered
  jobs is unchanged. Admin-only, as before.

4. Security
- Both RPCs keep their existing admin check
  (`profiles.role = 'admin'` for `auth.uid()`).
- The new helper is SECURITY DEFINER with a locked search_path and EXECUTE
  revoked from PUBLIC.
- `automation_name` is embedded with `quote_ident()` to prevent SQL injection
  from definition data.

5. Notes
- No tables, columns, or data are changed. Idempotent (function replacements).
- `admin_run_cron_job` is intentionally untouched.
*/

CREATE OR REPLACE FUNCTION public.cron_command_for_definition(p_job_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN d.automation_name IS NOT NULL THEN
      'SELECT public.' || quote_ident(d.automation_name) || '();'
    WHEN d.job_type = 'edge_function' THEN
      'SELECT net.http_post(url := ''https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/'
        || CASE d.job_name
             WHEN 'daily-renewal-check' THEN 'check-subscription-renewals'
             WHEN 'generate-daily-orders' THEN 'generate-orders'
             ELSE d.job_name
           END
        || ''', headers := ''{"Content-Type":"application/json"}''::jsonb, body := ''{}''::jsonb)'
    ELSE NULL
  END
  FROM public.cron_job_definitions d
  WHERE d.job_name = p_job_name
$function$;

REVOKE EXECUTE ON FUNCTION public.cron_command_for_definition(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_cron_job_status()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_is_admin boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_data ORDER BY sort_order, job_name)
    FROM (
      SELECT
        jsonb_build_object(
          'jobid', j.jobid,
          'job_name', d.job_name,
          'purpose', d.purpose,
          'schedule', COALESCE(j.schedule, d.schedule),
          'job_type', d.job_type,
          'automation_name', d.automation_name,
          'sort_order', d.sort_order,
          'active', COALESCE(j.active, false),
          'is_scheduled', (j.jobid IS NOT NULL),
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
        d.sort_order,
        d.job_name
      FROM public.cron_job_definitions d
      LEFT JOIN cron.job j ON j.jobname = d.job_name
      LEFT JOIN LATERAL (
        SELECT recent.start_time, recent.end_time, recent.status, recent.return_message
        FROM (
          SELECT rd.start_time, rd.end_time, rd.status, rd.return_message
          FROM cron.job_run_details rd
          WHERE rd.jobid = j.jobid
          UNION ALL
          SELECT ml.started_at, ml.ended_at, ml.status, ml.return_message
          FROM public.cron_manual_run_logs ml
          WHERE ml.job_name = d.job_name
        ) recent
        ORDER BY recent.start_time DESC NULLS LAST
        LIMIT 1
      ) r ON true
      LEFT JOIN LATERAL (
        SELECT
          (SELECT count(*)::integer FROM cron.job_run_details rd WHERE rd.jobid = j.jobid) AS scheduled_count,
          (SELECT count(*)::integer FROM public.cron_manual_run_logs ml WHERE ml.job_name = d.job_name) AS manual_count
      ) rc ON true

      UNION ALL

      SELECT
        jsonb_build_object(
          'jobid', j.jobid,
          'job_name', j.jobname,
          'purpose', 'Runs the scheduled ' || replace(initcap(replace(j.jobname, '-', ' ')), '_', ' ') || ' task',
          'schedule', j.schedule,
          'job_type', CASE WHEN j.command LIKE '%net.http_post%' THEN 'edge_function' ELSE 'sql' END,
          'automation_name', NULL,
          'sort_order', 1000,
          'active', j.active,
          'is_scheduled', true,
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
        1000,
        j.jobname
      FROM cron.job j
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
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cron_job_definitions d WHERE d.job_name = j.jobname
      )
    ) all_jobs
  ), '[]'::jsonb);
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_update_cron_job(p_job_name text, p_schedule text DEFAULT NULL::text, p_active boolean DEFAULT NULL::boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  v_is_admin boolean;
  v_jobid bigint;
  v_schedule text := NULLIF(btrim(p_schedule), '');
  v_current_schedule text;
  v_current_active boolean;
  v_def_schedule text;
  v_command text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  IF v_schedule IS NULL AND p_active IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No scheduler changes were provided');
  END IF;

  SELECT jobid INTO v_jobid
  FROM cron.job
  WHERE jobname = p_job_name;

  IF v_jobid IS NULL THEN
    -- Job is defined for the project but not registered in the scheduler yet.
    BEGIN
      SELECT schedule INTO v_def_schedule
      FROM public.cron_job_definitions
      WHERE job_name = p_job_name;

      IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cron job not found');
      END IF;

      IF p_active = false THEN
        -- Nothing to pause: the job is not scheduled at all.
        RETURN jsonb_build_object(
          'success', true,
          'job_name', p_job_name,
          'schedule', v_def_schedule,
          'active', false
        );
      END IF;

      v_command := public.cron_command_for_definition(p_job_name);
      IF v_command IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'No runnable command is defined for this job');
      END IF;

      v_jobid := cron.schedule(p_job_name, COALESCE(v_schedule, v_def_schedule), v_command);
    EXCEPTION WHEN OTHERS THEN
      RETURN jsonb_build_object('success', false, 'error', SQLERRM);
    END;
  END IF;

  BEGIN
    PERFORM cron.alter_job(
      job_id := v_jobid,
      schedule := v_schedule,
      active := p_active
    );

    SELECT schedule, active INTO v_current_schedule, v_current_active
    FROM cron.job
    WHERE jobid = v_jobid;

    RETURN jsonb_build_object(
      'success', true,
      'job_name', p_job_name,
      'schedule', v_current_schedule,
      'active', v_current_active
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
  END;
END;
$function$;

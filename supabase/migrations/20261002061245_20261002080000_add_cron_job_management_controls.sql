/*
# Add Cron Job Management Controls

1. Purpose
- Add the database operation used by the admin Cron Management page to pause, resume, and reschedule existing pg_cron jobs.
- Keep pg_cron as the source of truth so every change is applied to the live scheduler immediately.

2. Modified scheduler behavior
- Existing rows in `cron.job` can have their `active` state changed without deleting the job.
- Existing rows in `cron.job` can have their five-field cron schedule changed without changing the command that runs.
- No scheduled job is created, deleted, or replaced by this migration.

3. Security
- Add `admin_update_cron_job(text, text, boolean)` as a SECURITY DEFINER function.
- Only authenticated users whose profile role is `admin` can use it.
- The function looks up the job by name and passes the database-resolved job ID to pg_cron, preventing arbitrary command execution.
- Anonymous and public execution is revoked.

4. Important notes
- Pass `p_schedule` to change the schedule, `p_active` to pause or resume, or both together.
- Invalid cron expressions are rejected by pg_cron and returned as a failed operation without changing the job.
*/

CREATE OR REPLACE FUNCTION public.admin_update_cron_job(
  p_job_name text,
  p_schedule text DEFAULT NULL,
  p_active boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_is_admin boolean;
  v_jobid bigint;
  v_schedule text := NULLIF(btrim(p_schedule), '');
  v_current_schedule text;
  v_current_active boolean;
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
    RETURN jsonb_build_object('success', false, 'error', 'Cron job not found');
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
$$;

REVOKE ALL ON FUNCTION public.admin_update_cron_job(text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_cron_job(text, text, boolean) TO authenticated;
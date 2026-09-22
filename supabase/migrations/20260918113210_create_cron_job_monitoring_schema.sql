/*
  # Cron Job Monitoring

  Adds a monitoring layer for all existing pg_cron jobs in the project.
  Does NOT create any new cron schedules or duplicate any existing logic.

  1. `cron_job_definitions` — static metadata table populated with every
     existing cron job name, human-readable purpose, schedule, type, and
     the automation_name used in `automation_run_logs` (if any).
  2. `get_cron_job_status()` — SECURITY DEFINER function that reads
     `cron.job` + `cron.job_run_details` to return live status (last run,
     next run, duration, latest error) for each scheduled job. Admin-only.
  3. `admin_run_cron_job(p_job_name text)` — SECURITY DEFINER function
     that lets an admin manually execute the command of an existing
     cron job by name. It reads the job's `command` from `cron.job` and
     runs it. Admin-only via auth check.
  4. RLS on `cron_job_definitions` — admin-only CRUD.
*/

-- ═══ 1. cron_job_definitions ═══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cron_job_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name text NOT NULL UNIQUE,
  purpose text NOT NULL,
  schedule text NOT NULL,
  job_type text NOT NULL DEFAULT 'sql' CHECK (job_type IN ('sql','edge_function')),
  automation_name text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cron_job_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select_cron_job_definitions" ON cron_job_definitions;
CREATE POLICY "admins_select_cron_job_definitions" ON cron_job_definitions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_insert_cron_job_definitions" ON cron_job_definitions;
CREATE POLICY "admins_insert_cron_job_definitions" ON cron_job_definitions
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_update_cron_job_definitions" ON cron_job_definitions;
CREATE POLICY "admins_update_cron_job_definitions" ON cron_job_definitions
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_delete_cron_job_definitions" ON cron_job_definitions;
CREATE POLICY "admins_delete_cron_job_definitions" ON cron_job_definitions
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Seed all known cron jobs from the project migrations
INSERT INTO cron_job_definitions (job_name, purpose, schedule, job_type, automation_name, sort_order) VALUES
  ('daily-renewal-check', 'Auto-activate pending subs, send expiry/renewal notifications, expire past-due subs', '30 2 * * *', 'edge_function', 'daily_renewal_check', 1),
  ('generate-daily-orders', 'Generate daily order rows for subscriptions one day in advance', '0 0 * * *', 'edge_function', 'generate_daily_orders', 2),
  ('check-pending-subscribers', 'Send WhatsApp reminder to customers 24h after first login with no active subscription', '0 * * * *', 'edge_function', NULL, 3),
  ('mark-orders-out-for-delivery', 'Update scheduled orders to out_for_delivery status', '56 5 * * *', 'sql', NULL, 4),
  ('track-generate-orders', 'Log that generate-daily-orders edge function was triggered', '2 0 * * *', 'sql', 'generate_daily_orders', 5),
  ('track-daily-renewal-check', 'Log that daily-renewal-check edge function was triggered', '35 2 * * *', 'sql', 'daily_renewal_check', 6),
  ('notify-panji-festivals', 'Enqueue push notifications for tomorrow''s Panji festivals', '30 13 * * *', 'sql', NULL, 7),
  ('auto-assign-riders-daily', 'Zone-hierarchy rider assignment for next-day orders with load balancing', '30 18 * * *', 'sql', 'auto_assign_riders', 8),
  ('no-show-detection-615am', 'Detect no-show riders and reassign their orders', '45 0 * * *', 'sql', NULL, 9),
  ('no-show-safety-pass-630am', 'Second pass of no-show rider redistribution', '0 1 * * *', 'sql', NULL, 10),
  ('nightly-leave-redistribution', 'Reassign orders from riders on approved leave to backup riders', '30 16 * * *', 'sql', NULL, 11),
  ('auto-expire-subscriptions', 'Expire subscriptions past end_date', '30 18 * * *', 'sql', 'auto_expire_subscriptions', 12),
  ('auto-resume-paused-subscriptions', 'Resume paused subscriptions whose pause_until has passed', '31 18 * * *', 'sql', 'auto_resume_paused_subscriptions', 13),
  ('auto-cancel-pending-subscriptions', 'Cancel pending subscriptions older than 7 days', '32 18 * * *', 'sql', 'auto_cancel_pending_subscriptions', 14),
  ('retry-unassigned-relaxed', 'Fallback: assign unassigned orders to least-loaded active rider', '0 19 * * *', 'sql', 'retry_unassigned_relaxed', 15),
  ('auto-generate-vendor-payments', 'Generate vendor payment records for fulfilled procurement orders', '0 2 * * *', 'sql', 'auto_generate_vendor_payments', 16),
  ('daily-health-check', 'Compute daily ops snapshot (orders, riders, procurement, subs, alerts)', '30 1 * * *', 'sql', 'run_daily_health_check', 17),
  ('notify-rider-checkin-reminder', 'In-app notification to riders with assignments who haven''t checked in', '50 0 * * *', 'sql', 'notify_rider_checkin_reminder', 18),
  ('notify-admin-unassigned-alerts', 'In-app alert to admins about unassigned orders', '0 1 * * *', 'sql', 'notify_admin_unassigned_alerts', 19),
  ('auto-procurement-from-requirements', 'Generate draft procurement orders from daily requirements (best-price vendor)', '35 18 * * *', 'sql', 'auto_generate_procurement', 20),
  ('notify-vendors-procurement', 'In-app notification to vendors about auto-generated procurement orders', '36 18 * * *', 'sql', NULL, 21),
  ('auto-calculate-rider-payouts', 'Weekly rider payout calculation (base + per-delivery bonus)', '0 18 * * *', 'sql', 'auto_calculate_rider_payouts', 22),
  ('send-renewal-payment-reminders', 'In-app reminder to customers whose subscriptions end within 3 days', '30 2 * * *', 'sql', 'send_renewal_payment_reminders', 23),
  ('retry-failed-cron-jobs', 'Re-run any automation that lacks a success log for today', '0 2 * * *', 'sql', 'retry_failed_cron_jobs', 24),
  ('notify-rider-assignments-in-app', 'Notify each rider of their assignment count after midnight assignment', '40 18 * * *', 'sql', NULL, 25),
  ('notify-customer-dispatch-in-app', 'Notify customers their order is scheduled for delivery', '45 18 * * *', 'sql', NULL, 26)
ON CONFLICT (job_name) DO UPDATE SET
  purpose = EXCLUDED.purpose,
  schedule = EXCLUDED.schedule,
  job_type = EXCLUDED.job_type,
  automation_name = EXCLUDED.automation_name,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ═══ 2. get_cron_job_status() ═════════════════════════════════════════════

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
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'jobid', j.jobid,
      'job_name', j.jobname,
      'schedule', j.schedule,
      'active', j.active,
      'command', j.command,
      'last_run_start', r.start_time,
      'last_run_end', r.end_time,
      'last_run_status', r.status,
      'last_run_duration_ms', CASE WHEN r.start_time IS NOT NULL AND r.end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (r.end_time - r.start_time)) * 1000 ELSE NULL END,
      'last_run_return', r.return_message,
      'last_error', CASE WHEN r.status = 1 THEN r.return_message ELSE NULL END
    )
    ORDER BY j.jobname
  ), '[]'::jsonb)
  INTO v_result
  FROM cron.job j
  LEFT JOIN LATERAL (
    SELECT * FROM cron.job_run_details rd
    WHERE rd.jobid = j.jobid
    ORDER BY rd.runid DESC
    LIMIT 1
  ) r ON true;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_cron_job_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_cron_job_status() TO authenticated;

-- ═══ 3. admin_run_cron_job() ══════════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_run_cron_job(p_job_name text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_is_admin boolean;
  v_command text;
  v_jobid bigint;
  v_result jsonb;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT jobid, command INTO v_jobid, v_command
  FROM cron.job
  WHERE jobname = p_job_name AND active = true;

  IF v_command IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Cron job not found or inactive');
  END IF;

  BEGIN
    EXECUTE v_command;
    RETURN jsonb_build_object('success', true, 'job_name', p_job_name);
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'job_name', p_job_name, 'error', SQLERRM);
  END;
END;
$$;

REVOKE ALL ON FUNCTION admin_run_cron_job(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_run_cron_job(text) TO authenticated;

-- ═══ 4. get_cron_job_run_history() ════════════════════════════════════════

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
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') INTO v_is_admin;
  IF NOT v_is_admin THEN
    RETURN jsonb_build_object('error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'runid', rd.runid,
      'job_name', j.jobname,
      'start_time', rd.start_time,
      'end_time', rd.end_time,
      'status', CASE rd.status WHEN 0 THEN 'starting' WHEN 1 THEN 'failed' WHEN 2 THEN 'succeeded' WHEN 3 THEN 'timeout' ELSE 'unknown' END,
      'duration_ms', CASE WHEN rd.start_time IS NOT NULL AND rd.end_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (rd.end_time - rd.start_time)) * 1000 ELSE NULL END,
      'return_message', rd.return_message
    )
    ORDER BY rd.runid DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM cron.job_run_details rd
  JOIN cron.job j ON j.jobid = rd.jobid
  WHERE j.jobname = p_job_name
  LIMIT p_limit;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION get_cron_job_run_history(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_cron_job_run_history(text, integer) TO authenticated;

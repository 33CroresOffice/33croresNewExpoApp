/*
# Register and activate all project cron jobs; fix incentive evaluation bug

1. Purpose
- None of the project's 28 cron jobs were actually running: 19 were never
  registered in the pg_cron scheduler and the other 9 were registered but
  paused. This migration registers and activates every job the project marks
  as active (24 jobs), so the Cron Management screen reports live executions.
- Jobs the project marks as inactive (no-show detection passes, leave
  redistribution, relaxed retry) stay off — nothing changes for them.

2. Bug fix: `public.auto_evaluate_rider_incentives(p_month text)`
- The nightly incentive job failed with "operator does not exist: date ...
  text" because it compared date columns (rider_attendance.date,
  rider_leave_requests.leave_date, orders.scheduled_date) against text.
- Re-created the function with proper date comparisons. Logic, output, and
  signature are otherwise identical.

3. Definition corrections in `cron_job_definitions`
- `auto-procurement-from-requirements` now points to the real function
  `auto_generate_procurement_from_requirements` (the old name never existed).
- `notify-vendors-procurement` now points to `notify_vendors_procurement_in_app`.
- `cron_command_for_definition` special cases jobs that need a date argument:
  auto-assign-riders-daily, notify-rider-assignments-in-app, and
  notify-customer-dispatch-in-app run with (CURRENT_DATE + 1).

4. Scheduler registration
- For every active job: any existing scheduler entry with the same name is
  replaced, then the job is scheduled with the correct command and left
  active. Idempotent — safe to re-run.
- Edge-function jobs use net.http_post to the project's Edge Functions.
- SQL jobs call their public automation function directly.

5. Security
- No RLS or privilege changes beyond existing admin RPCs.
- pg_cron runs jobs with elevated privileges internally; no keys or secrets
  are added.

6. Notes
- Paused/inactive jobs remain listed on the page but do not run until an
  admin activates them.
- No tables or columns are dropped; no data is lost.
*/

-- ============================================================
-- 1. Fix auto_evaluate_rider_incentives date/text comparisons
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_evaluate_rider_incentives(p_month text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_month_start date := (p_month || '-01')::date;
v_month_end date := (date_trunc('month', v_month_start) + interval '1 month')::date;
v_rider RECORD;
v_inc RECORD;
v_earned numeric(10,2) := 0;
v_status text := 'failed';
v_on_time_att_days int := 0;
v_on_time_del_days int := 0;
v_present_count int := 0;
v_absent_count int := 0;
v_leave_count int := 0;
v_delivery_count int := 0;
v_has_feedback bool := false;
v_has_quality_report bool := false;
v_cutoff_time text;
v_result text;
BEGIN
FOR v_rider IN SELECT id FROM riders WHERE is_active = true LOOP

SELECT COUNT(*) FILTER (WHERE status = 'present') INTO v_present_count
FROM rider_attendance
WHERE rider_id = v_rider.id AND date >= v_month_start AND date < v_month_end;

SELECT COUNT(*) FILTER (WHERE status = 'absent') INTO v_absent_count
FROM rider_attendance
WHERE rider_id = v_rider.id AND date >= v_month_start AND date < v_month_end;

SELECT COUNT(*) INTO v_leave_count
FROM (
SELECT 1 FROM rider_leave_requests
WHERE rider_id = v_rider.id
AND leave_date >= v_month_start
AND leave_date < v_month_end
AND status = 'approved'
UNION
SELECT 1 FROM rider_attendance
WHERE rider_id = v_rider.id
AND status = 'leave'
AND date >= v_month_start
AND date < v_month_end
) AS combined_leaves;

SELECT COUNT(*) INTO v_delivery_count
FROM rider_order_assignments
WHERE rider_id = v_rider.id
AND status = 'delivered'
AND delivered_at >= v_month_start::timestamptz
AND delivered_at < v_month_end::timestamptz;

SELECT EXISTS(
SELECT 1 FROM rider_customer_feedback
WHERE rider_id = v_rider.id AND month = p_month AND rating = 'positive'
) INTO v_has_feedback;

SELECT EXISTS(
SELECT 1 FROM rider_quality_reports
WHERE rider_id = v_rider.id
AND created_at >= v_month_start::timestamptz
AND created_at < v_month_end::timestamptz
) INTO v_has_quality_report;

FOR v_inc IN SELECT * FROM rider_incentives WHERE is_active = true LOOP
v_earned := 0;
v_status := 'failed';
v_cutoff_time := v_inc.cutoff_time;

IF v_inc.bonus_category = 'on_time_attendance' THEN
SELECT COUNT(*) INTO v_on_time_att_days
FROM rider_attendance
WHERE rider_id = v_rider.id
AND status = 'present'
AND date >= v_month_start
AND date < v_month_end
AND check_in_time IS NOT NULL
AND to_char(check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') <= v_cutoff_time;

IF v_on_time_att_days > 0 THEN
v_status := 'passed';
v_earned := v_on_time_att_days * v_inc.amount;
END IF;

ELSIF v_inc.bonus_category = 'on_time_delivery' THEN
SELECT COUNT(*) INTO v_on_time_del_days
FROM (
SELECT o.scheduled_date
FROM rider_order_assignments roa
JOIN orders o ON o.id = roa.order_id
WHERE roa.rider_id = v_rider.id
AND roa.status <> 'reassigned'
AND o.scheduled_date >= v_month_start
AND o.scheduled_date < v_month_end
GROUP BY o.scheduled_date
HAVING COUNT(*) = COUNT(
CASE WHEN roa.status = 'delivered'
AND roa.delivered_at IS NOT NULL
AND to_char(roa.delivered_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') <= v_cutoff_time
THEN 1 END
)
AND COUNT(*) > 0
) AS qualifying_days;

IF v_on_time_del_days > 0 THEN
v_status := 'passed';
v_earned := v_on_time_del_days * v_inc.amount;
END IF;

ELSIF v_inc.bonus_category = 'no_leave' THEN
IF v_absent_count = 0 AND v_leave_count = 0 THEN
v_status := 'passed';
v_earned := v_inc.amount;
END IF;

ELSIF v_inc.bonus_category = 'customer_feedback' THEN
IF v_has_feedback THEN
v_status := 'passed';
v_earned := v_inc.amount;
END IF;

ELSIF v_inc.bonus_category = 'flower_quality' THEN
IF v_has_quality_report THEN
v_status := 'passed';
v_earned := v_inc.amount;
END IF;

ELSE
v_status := 'passed';
v_earned := v_inc.amount;

IF v_inc.min_deliveries IS NOT NULL AND v_delivery_count < v_inc.min_deliveries THEN
v_status := 'failed';
v_earned := 0;
END IF;

IF v_status = 'passed' AND v_inc.min_present_days IS NOT NULL AND v_present_count < v_inc.min_present_days THEN
v_status := 'failed';
v_earned := 0;
END IF;

IF v_status = 'passed' AND v_inc.max_absent_days IS NOT NULL AND v_absent_count > v_inc.max_absent_days THEN
v_status := 'failed';
v_earned := 0;
END IF;

IF v_status = 'passed' AND COALESCE(v_inc.evaluation_basis, v_inc.type) = 'per_day' THEN
v_earned := v_present_count * v_inc.amount;
END IF;
END IF;

INSERT INTO rider_incentive_evaluations (rider_id, incentive_id, month, status, earned_amount, qualified_at, qualified_by, notes)
VALUES (v_rider.id, v_inc.id, p_month, v_status, v_earned,
CASE WHEN v_status = 'passed' THEN now() ELSE null END,
null,
'auto-evaluated')
ON CONFLICT (rider_id, incentive_id, month)
DO UPDATE SET
status = EXCLUDED.status,
earned_amount = EXCLUDED.earned_amount,
qualified_at = EXCLUDED.qualified_at,
notes = 'auto-evaluated',
updated_at = now();
END LOOP;
END LOOP;

v_result := 'Evaluated incentives for month ' || p_month;
RETURN v_result;
END;
$function$;

-- ============================================================
-- 2. Correct job definitions pointing at wrong function names
-- ============================================================
UPDATE public.cron_job_definitions
SET automation_name = 'auto_generate_procurement_from_requirements',
    updated_at = now()
WHERE job_name = 'auto-procurement-from-requirements';

UPDATE public.cron_job_definitions
SET automation_name = 'notify_vendors_procurement_in_app',
    updated_at = now()
WHERE job_name = 'notify-vendors-procurement';

-- ============================================================
-- 3. cron_command_for_definition: date-arg special cases
-- ============================================================
CREATE OR REPLACE FUNCTION public.cron_command_for_definition(p_job_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN d.job_name IN ('auto-assign-riders-daily','notify-rider-assignments-in-app','notify-customer-dispatch-in-app') THEN
      'SELECT public.' || quote_ident(d.automation_name) || '(CURRENT_DATE + 1);'
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

-- ============================================================
-- 4. Register + activate every active project job
-- ============================================================
DO $$
DECLARE
  r RECORD;
  v_command text;
BEGIN
  FOR r IN
    SELECT d.job_name, d.schedule, d.job_type, d.automation_name
    FROM public.cron_job_definitions d
    WHERE d.is_active = true
  LOOP
    -- Replace any existing scheduler entry with this name
    BEGIN
      PERFORM cron.unschedule(r.job_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    IF r.job_type = 'edge_function' THEN
      v_command := 'SELECT net.http_post(url := ''https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/'
        || CASE r.job_name
             WHEN 'daily-renewal-check' THEN 'check-subscription-renewals'
             WHEN 'generate-daily-orders' THEN 'generate-orders'
             ELSE r.job_name
           END
        || ''', headers := ''{"Content-Type":"application/json"}''::jsonb, body := ''{}''::jsonb)';
    ELSE
      v_command := public.cron_command_for_definition(r.job_name);
    END IF;

    IF v_command IS NOT NULL THEN
      PERFORM cron.schedule(r.job_name, r.schedule, v_command);
    END IF;
  END LOOP;
END;
$$;

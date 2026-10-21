/*
# Register the two remaining active cron jobs

1. Purpose
- The previous registration pass skipped two active jobs whose definitions had
  no single function name: `mark-orders-out-for-delivery` (a raw SQL update)
  and `auto-evaluate-rider-incentives-nightly` (runs two functions).
- This migration adds explicit commands for both in
  `cron_command_for_definition` and registers them in the scheduler, active.

2. Changes
- `public.cron_command_for_definition()` special cases:
  - `auto-evaluate-rider-incentives-nightly` → runs
    auto_evaluate_rider_incentives(current IST month) then
    calculate_rider_rankings for the same month.
  - `mark-orders-out-for-delivery` → updates today's scheduled orders to
    out_for_delivery.
- Both jobs are (re)scheduled with their definition schedule, active.

3. Security
- No privilege changes. Idempotent (existing entries are unscheduled first).

4. Notes
- No tables, columns, or data are changed.
*/

CREATE OR REPLACE FUNCTION public.cron_command_for_definition(p_job_name text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT CASE
    WHEN d.job_name IN ('auto-assign-riders-daily','notify-rider-assignments-in-app','notify-customer-dispatch-in-app') THEN
      'SELECT public.' || quote_ident(d.automation_name) || '(CURRENT_DATE + 1);'
    WHEN d.job_name = 'auto-evaluate-rider-incentives-nightly' THEN
      'SELECT public.auto_evaluate_rider_incentives(to_char((now() AT TIME ZONE ''Asia/Kolkata'')::date, ''YYYY-MM''));'
      || 'SELECT public.calculate_rider_rankings(to_char((now() AT TIME ZONE ''Asia/Kolkata'')::date, ''YYYY-MM''));'
    WHEN d.job_name = 'mark-orders-out-for-delivery' THEN
      'UPDATE public.orders SET status = ''out_for_delivery'' WHERE status = ''scheduled'' AND scheduled_date = CURRENT_DATE'
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

DO $$
DECLARE
  r RECORD;
  v_command text;
BEGIN
  FOR r IN
    SELECT job_name, schedule
    FROM public.cron_job_definitions
    WHERE job_name IN ('auto-evaluate-rider-incentives-nightly','mark-orders-out-for-delivery')
  LOOP
    BEGIN
      PERFORM cron.unschedule(r.job_name);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    v_command := public.cron_command_for_definition(r.job_name);
    IF v_command IS NOT NULL THEN
      PERFORM cron.schedule(r.job_name, r.schedule, v_command);
    END IF;
  END LOOP;
END;
$$;

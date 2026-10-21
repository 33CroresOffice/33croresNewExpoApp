/*
# Register the final three active cron jobs

1. Purpose
- Three active jobs were skipped during registration because their definitions
  had no function name recorded: `notify-panji-festivals`,
  `notify-rider-assignments-in-app`, and `notify-customer-dispatch-in-app`.
- This migration fills in their function names in `cron_job_definitions` and
  schedules all three, active.

2. Changes
- Definitions updated:
  - notify-panji-festivals → notify_panji_festivals()
  - notify-rider-assignments-in-app → notify_rider_assignments_in_app (runs
    with CURRENT_DATE + 1 via the existing special case)
  - notify-customer-dispatch-in-app → notify_customer_dispatch_in_app (also
    CURRENT_DATE + 1)
- All three jobs are (re)scheduled with their definition schedule, active.

3. Security
- No privilege changes. Idempotent (existing entries unscheduled first).

4. Notes
- No tables, columns, or data are changed.
*/

UPDATE public.cron_job_definitions
SET automation_name = 'notify_panji_festivals', updated_at = now()
WHERE job_name = 'notify-panji-festivals';

UPDATE public.cron_job_definitions
SET automation_name = 'notify_rider_assignments_in_app', updated_at = now()
WHERE job_name = 'notify-rider-assignments-in-app';

UPDATE public.cron_job_definitions
SET automation_name = 'notify_customer_dispatch_in_app', updated_at = now()
WHERE job_name = 'notify-customer-dispatch-in-app';

DO $$
DECLARE
  r RECORD;
  v_command text;
BEGIN
  FOR r IN
    SELECT job_name, schedule
    FROM public.cron_job_definitions
    WHERE job_name IN (
      'notify-panji-festivals',
      'notify-rider-assignments-in-app',
      'notify-customer-dispatch-in-app'
    )
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

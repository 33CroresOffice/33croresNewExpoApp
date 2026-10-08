/*
# Auto-mark absent riders at end of day

1. New Function
- `mark_absent_riders_for_date(target_date date DEFAULT NULL)` — SECURITY DEFINER
- For the given date (defaults to yesterday IST), finds all active riders who
  have NO row in `rider_attendance` for that date and inserts an 'absent' row.
- Skips riders who already have any attendance row (present, absent, leave, etc.)
  so it never overwrites existing records.
- Runs as a SECURITY DEFINER function owned by the postgres role so it can
  insert rows bypassing RLS (the cron job has no authenticated session).

2. Cron Job
- `auto-mark-absent-riders` — runs daily at 15:30 UTC (= 21:00 IST / 9 PM)
- At 9 PM IST the workday is definitively over; any rider who has not checked
  in is counted as absent for that day.
- Calls the function with no argument, which defaults to today's IST date.

3. Security
- The function is SECURITY DEFINER, owned by postgres, and granted EXECUTE
  to authenticated so admins can also call it manually for a specific date.
- It only INSERTs (never UPDATEs or DELETEs), and only for riders with no
  existing record, so it cannot overwrite human-marked attendance.
*/

-- ═══ 1. Create the function ══════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mark_absent_riders_for_date(target_date date DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d date;
  inserted_count integer;
  ist_today date;
BEGIN
  -- Compute "today" in IST (UTC+5:30). At 9 PM IST the IST date is still today.
  ist_today := (now() AT TIME ZONE 'Asia/Kolkata')::date;

  -- If no target date passed, default to today's IST date.
  d := COALESCE(target_date, ist_today);

  -- Insert 'absent' rows for active riders who have no attendance record for date d.
  INSERT INTO public.rider_attendance (rider_id, date, status, notes, recorded_by)
  SELECT r.id, d, 'absent', 'Auto-marked absent (no check-in)', NULL
  FROM public.riders r
  WHERE r.is_active = true
    AND r.approval_status = 'approved'
    AND NOT EXISTS (
      SELECT 1 FROM public.rider_attendance ra
      WHERE ra.rider_id = r.id AND ra.date = d
    );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_absent_riders_for_date(date) TO authenticated;

-- ═══ 2. Schedule the cron job ════════════════════════════════════════════
-- Remove existing job if re-applied
SELECT cron.unschedule('auto-mark-absent-riders')
FROM cron.job
WHERE jobname = 'auto-mark-absent-riders';

-- 15:30 UTC = 21:00 IST (9 PM) — the workday is over, mark no-shows as absent
SELECT cron.schedule(
  'auto-mark-absent-riders',
  '30 15 * * *',
  $$ SELECT public.mark_absent_riders_for_date(); $$
);

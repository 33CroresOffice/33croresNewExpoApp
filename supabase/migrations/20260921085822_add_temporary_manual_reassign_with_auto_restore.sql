/*
# Temporary manual reassignment with automatic return to original rider

## What this does
When an Admin manually reassigns a rider's orders for a date range (e.g. the rider
is on leave Sep 21 - Sep 25), the replacement rider now gets those orders only for
that period. Once the End Date passes, any still-active orders automatically return
to the original rider. The original rider's assignment is therefore not permanently
overwritten.

## 1. Schema changes
Table `rider_order_assignments` (existing, no data touched):
- `temp_reassign_start_date` (date) - start of the temporary reassignment period
- `temp_reassign_end_date` (date) - end of the temporary reassignment period
- `original_rider_id` (uuid) - the rider the order returns to after the period
- `is_temporary_reassign` (boolean, default false) - marks a row as a temporary cover assignment

## 2. Functions
- `manual_reassign_orders(p_assignment_ids, p_new_rider_id, p_reason, p_start_date, p_end_date)`
  Updated: two new optional date parameters. When a date range is provided, the
  new assignment row created for the replacement rider is flagged as temporary and
  records the period plus the original rider. When no range is provided it behaves
  exactly as before (permanent reassign).
- `restore_temporary_reassignments()`
  New: finds temporary assignments whose End Date has passed and that are still
  active (assigned/accepted/picked_up), marks them reassigned, and inserts a fresh
  assignment for the ORIGINAL rider on the same order. Delivered or failed orders
  are left alone.

## 3. Automation
- pg_cron job `restore-temporary-reassignments` runs daily at 19:30 UTC (1:00 AM IST)
  and calls `restore_temporary_reassignments()` so expired covers return automatically.
- A matching row is added to `cron_job_definitions` so the job shows on the Cron Monitor page.

## 4. Security
- No new tables. Functions are SECURITY DEFINER (same pattern as existing assignment
  functions) so the cron scheduler can run them. RLS policies on the assignments
  table are unchanged.
*/

-- 1. Columns for temporary reassignment tracking
ALTER TABLE rider_order_assignments
  ADD COLUMN IF NOT EXISTS temp_reassign_start_date date,
  ADD COLUMN IF NOT EXISTS temp_reassign_end_date date,
  ADD COLUMN IF NOT EXISTS original_rider_id uuid,
  ADD COLUMN IF NOT EXISTS is_temporary_reassign boolean NOT NULL DEFAULT false;

-- 2. Updated manual reassign function (temporary-aware)
CREATE OR REPLACE FUNCTION manual_reassign_orders(
  p_assignment_ids uuid[],
  p_new_rider_id uuid,
  p_reason text DEFAULT 'Manual reassignment',
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_reassigned_count integer := 0;
  v_failed_count integer := 0;
BEGIN
  FOR v_assignment IN
    SELECT id, rider_id, order_id, delivery_fee, distance_km, notes
    FROM rider_order_assignments
    WHERE id = ANY(p_assignment_ids)
      AND status IN ('assigned','accepted','picked_up')
  LOOP
    -- Mark old assignment as reassigned
    UPDATE rider_order_assignments
    SET status = 'reassigned',
        is_reassigned = true,
        swap_reason = p_reason,
        swapped_from_rider_id = v_assignment.rider_id,
        updated_at = now()
    WHERE id = v_assignment.id;

    -- Create new assignment for replacement rider.
    -- When a date range is given, flag it as a temporary cover that the
    -- restore job returns to the original rider after the End Date passes.
    INSERT INTO rider_order_assignments
      (rider_id, order_id, status, delivery_fee, distance_km, notes,
       swap_reason, swapped_from_rider_id, auto_assigned,
       is_temporary_reassign, temp_reassign_start_date, temp_reassign_end_date, original_rider_id)
    VALUES
      (p_new_rider_id, v_assignment.order_id, 'assigned',
       v_assignment.delivery_fee, v_assignment.distance_km, v_assignment.notes,
       p_reason, v_assignment.rider_id, false,
       (p_start_date IS NOT NULL AND p_end_date IS NOT NULL), p_start_date, p_end_date, v_assignment.rider_id);

    v_reassigned_count := v_reassigned_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reassigned', v_reassigned_count,
    'failed', v_failed_count
  );
END;
$$;

-- 3. Restore function: return expired temporary covers to the original rider
CREATE OR REPLACE FUNCTION restore_temporary_reassignments()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec RECORD;
  v_restored integer := 0;
BEGIN
  FOR v_rec IN
    SELECT id, order_id, rider_id, original_rider_id
    FROM rider_order_assignments
    WHERE is_temporary_reassign = true
      AND temp_reassign_end_date IS NOT NULL
      AND temp_reassign_end_date < CURRENT_DATE
      AND status IN ('assigned','accepted','picked_up')
  LOOP
    UPDATE rider_order_assignments
    SET status = 'reassigned',
        is_reassigned = true,
        swap_reason = 'Temporary reassignment period ended',
        updated_at = now()
    WHERE id = v_rec.id;

    INSERT INTO rider_order_assignments
      (rider_id, order_id, status, auto_assigned, notes, swap_reason, swapped_from_rider_id)
    VALUES
      (v_rec.original_rider_id, v_rec.order_id, 'assigned', false,
       'Auto-restored: temporary reassignment period ended',
       'Temporary reassignment period ended', v_rec.rider_id);

    v_restored := v_restored + 1;
  END LOOP;

  RETURN jsonb_build_object('restored', v_restored, 'run_at', now());
END;
$$;

-- 4. Nightly cron job (19:30 UTC = 1:00 AM IST, after the reassignment day completes)
DO $$
BEGIN
  PERFORM cron.unschedule('restore-temporary-reassignments');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('restore-temporary-reassignments', '30 19 * * *', $$SELECT restore_temporary_reassignments()$$);

-- 5. Register in the cron monitor definitions table (idempotent)
INSERT INTO cron_job_definitions (id, job_name, purpose, schedule, job_type, automation_name, is_active, sort_order)
SELECT gen_random_uuid(), 'restore-temporary-reassignments',
       'Returns expired temporary manual reassignments to the original rider',
       '30 19 * * *', 'sql', 'restore_temporary_reassignments', true, 900
WHERE NOT EXISTS (SELECT 1 FROM cron_job_definitions WHERE job_name = 'restore-temporary-reassignments');
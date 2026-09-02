/*
# Fix pause history trigger: update existing row on edit, not just insert on new

## Problem
When an admin or customer edits an existing pause's dates (e.g. 23–24 changed
to 23–26), the trigger `log_subscription_pause_history` only inserts a new
history row for genuinely new pauses. Date edits to an existing pause do
nothing — the old history row keeps the old dates, so the
`recalculate_subscription_new_end_date` trigger never fires and
`new_end_date` is never recalculated.

This caused: pause edits not reflected in new_end_date, and duplicate
history rows when the app code also manually inserts.

## Fix
Update the trigger function to handle three cases:
1. NEW pause (was not paused, now paused): insert a new history row.
2. EDITED pause (was paused, still paused, dates changed): update the
   most recent open history row with the new dates. This fires the
   recalculate trigger via the UPDATE on subscription_pause_history.
3. RESUME (was paused, now active): set resumed_at on the open history row.

## Security
- SECURITY DEFINER with fixed search_path = public. No RLS changes.
- Idempotent: safe to re-run.

## Important Notes
1. Original subscriptions.start_date and subscriptions.end_date are never
   modified by this trigger.
2. Only the most recent open (resumed_at IS NULL, is_cancelled = false)
   history row is updated on edit, preventing duplicates.
3. The recalculate_subscription_new_end_date trigger on
   subscription_pause_history fires after this UPDATE, so new_end_date
   is correctly recalculated.
*/

CREATE OR REPLACE FUNCTION log_subscription_pause_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  open_history_id uuid;
BEGIN
  -- CASE 1: NEW pause (was not paused before, now paused)
  IF NEW.pause_start_date IS NOT NULL AND NEW.pause_until IS NOT NULL
     AND OLD.pause_start_date IS NULL THEN
    INSERT INTO subscription_pause_history (subscription_id, pause_start_date, pause_until, created_at)
    VALUES (NEW.id, NEW.pause_start_date, NEW.pause_until, NOW());
  END IF;

  -- CASE 2: EDITED pause (was paused, still paused, dates changed)
  -- Update the most recent open history row instead of inserting a duplicate
  IF NEW.pause_start_date IS NOT NULL AND NEW.pause_until IS NOT NULL
     AND OLD.pause_start_date IS NOT NULL
     AND (OLD.pause_start_date IS DISTINCT FROM NEW.pause_start_date
          OR OLD.pause_until IS DISTINCT FROM NEW.pause_until) THEN
    SELECT id INTO open_history_id
    FROM subscription_pause_history
    WHERE subscription_id = NEW.id
      AND resumed_at IS NULL
      AND COALESCE(is_cancelled, false) = false
    ORDER BY created_at DESC
    LIMIT 1;

    IF open_history_id IS NOT NULL THEN
      UPDATE subscription_pause_history
      SET pause_start_date = NEW.pause_start_date,
          pause_until = NEW.pause_until
      WHERE id = open_history_id;
    ELSE
      -- No open history row found (shouldn't happen, but be safe): insert one
      INSERT INTO subscription_pause_history (subscription_id, pause_start_date, pause_until, created_at)
      VALUES (NEW.id, NEW.pause_start_date, NEW.pause_until, NOW());
    END IF;
  END IF;

  -- CASE 3: RESUME (status changed from paused to active)
  IF OLD.status = 'paused' AND NEW.status = 'active'
     AND NEW.pause_start_date IS NULL AND NEW.pause_until IS NULL THEN
    UPDATE subscription_pause_history
    SET resumed_at = CURRENT_DATE
    WHERE subscription_id = NEW.id
      AND resumed_at IS NULL
      AND COALESCE(is_cancelled, false) = false
      AND id = (
        SELECT id FROM subscription_pause_history
        WHERE subscription_id = NEW.id
          AND resumed_at IS NULL
          AND COALESCE(is_cancelled, false) = false
        ORDER BY pause_start_date DESC
        LIMIT 1
      );
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure the trigger is attached (idempotent)
DROP TRIGGER IF EXISTS on_subscription_pause_change ON subscriptions;
CREATE TRIGGER on_subscription_pause_change
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION log_subscription_pause_history();

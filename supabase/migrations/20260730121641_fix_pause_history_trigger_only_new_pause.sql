/*
# Fix duplicate pause history: trigger only inserts on new pause

## Problem
The previous trigger inserted a history row whenever pause_start_date or
pause_until changed. But the app code also manually inserts/updates history
rows, causing duplicates when a pause is edited.

## Fix
Only insert a new history row when it's a genuinely NEW pause
(OLD.pause_start_date IS NULL AND NEW.pause_start_date IS NOT NULL).
Date edits to an existing pause are handled by app code (updating the
existing open history row), so the trigger should not insert again.
*/

CREATE OR REPLACE FUNCTION log_subscription_pause_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only insert on a genuinely NEW pause (was not paused before)
  IF NEW.pause_start_date IS NOT NULL AND NEW.pause_until IS NOT NULL
     AND OLD.pause_start_date IS NULL THEN
    INSERT INTO subscription_pause_history (subscription_id, pause_start_date, pause_until, created_at)
    VALUES (NEW.id, NEW.pause_start_date, NEW.pause_until, NOW());
  END IF;

  -- Resume: status changed from 'paused' to 'active'
  IF OLD.status = 'paused' AND NEW.status = 'active' THEN
    UPDATE subscription_pause_history
    SET resumed_at = CURRENT_DATE
    WHERE subscription_id = NEW.id
      AND resumed_at IS NULL
      AND id = (
        SELECT id FROM subscription_pause_history
        WHERE subscription_id = NEW.id AND resumed_at IS NULL
        ORDER BY pause_start_date DESC
        LIMIT 1
      );
  END IF;

  RETURN NEW;
END;
$$;

/*
# Auto-log subscription pause history via trigger

## Problem
When an admin pauses a customer's subscription from the admin panel, the
pause details are saved to the `subscriptions` table but the insert into
`subscription_pause_history` is silently blocked by RLS. This happens because
the admin's JWT may not contain the `role` claim in `app_metadata` (e.g. if
they logged in before the role was synced). The result: pause history appears
empty on the order details page.

## Fix
Create a database trigger that fires AFTER UPDATE on `subscriptions` and
automatically inserts/updates rows in `subscription_pause_history`. The
trigger function uses SECURITY DEFINER so it bypasses RLS entirely.

- When pause_start_date or pause_until changes (new pause or edited pause):
  insert a new subscription_pause_history row.
- When status changes from 'paused' to 'active' (resume):
  update the most recent open pause history row with resumed_at = CURRENT_DATE.

## Changes
- New function: `log_subscription_pause_history()` (SECURITY DEFINER)
- New trigger: `on_subscription_pause_change` AFTER UPDATE on `subscriptions`
*/

CREATE OR REPLACE FUNCTION log_subscription_pause_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- New pause or pause dates changed: insert a history record
  IF NEW.pause_start_date IS NOT NULL AND NEW.pause_until IS NOT NULL
     AND (OLD.pause_start_date IS DISTINCT FROM NEW.pause_start_date
          OR OLD.pause_until IS DISTINCT FROM NEW.pause_until) THEN
    INSERT INTO subscription_pause_history (subscription_id, pause_start_date, pause_until, created_at)
    VALUES (NEW.id, NEW.pause_start_date, NEW.pause_until, NOW());
  END IF;

  -- Resume: status changed from 'paused' to 'active'
  IF OLD.status = 'paused' AND NEW.status = 'active'
     AND NEW.pause_start_date IS NULL AND NEW.pause_until IS NULL THEN
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

DROP TRIGGER IF EXISTS on_subscription_pause_change ON subscriptions;
CREATE TRIGGER on_subscription_pause_change
  AFTER UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION log_subscription_pause_history();

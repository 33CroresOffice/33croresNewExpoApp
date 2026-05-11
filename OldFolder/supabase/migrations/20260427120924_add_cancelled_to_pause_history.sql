/*
  # Add cancelled flag to subscription_pause_history

  ## Changes
  - Add `is_cancelled` boolean column (default false) to `subscription_pause_history`
  - Mark existing orphaned rows as cancelled where the parent subscription
    has no matching pause_start_date (meaning the pause was cancelled)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_pause_history' AND column_name = 'is_cancelled'
  ) THEN
    ALTER TABLE subscription_pause_history ADD COLUMN is_cancelled boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- Mark orphaned history rows as cancelled:
-- A row is orphaned when the subscription's current pause_start_date doesn't match
-- and the subscription status is active (not paused/scheduled_pause)
UPDATE subscription_pause_history h
SET is_cancelled = true
WHERE h.resumed_at IS NULL
  AND h.is_cancelled = false
  AND EXISTS (
    SELECT 1 FROM subscriptions s
    WHERE s.id = h.subscription_id
      AND s.status = 'active'
      AND (s.pause_start_date IS NULL OR s.pause_start_date != h.pause_start_date)
  );

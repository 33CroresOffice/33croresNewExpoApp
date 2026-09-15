/*
# Backfill subscriptions.pause_start_date / pause_until from active pause history

## Problem
Some subscriptions have active (non-cancelled, non-resumed) pause history records
but their `pause_start_date` and `pause_until` columns on the `subscriptions` table
are NULL. This causes the order detail page and orders list to show them as "active"
instead of "paused".

## Fix
Sync the pause columns from the most recent active pause history entry.
Only touches subscriptions that have an active pause record but NULL pause columns.
*/
UPDATE subscriptions s
SET
  pause_start_date = ph.pause_start_date,
  pause_until = ph.pause_until,
  status = CASE
    WHEN ph.pause_start_date <= CURRENT_DATE AND ph.pause_until >= CURRENT_DATE
      THEN 'paused'
    ELSE s.status
  END
FROM (
  SELECT DISTINCT ON (subscription_id)
    subscription_id,
    pause_start_date,
    pause_until
  FROM subscription_pause_history
  WHERE is_cancelled = false
    AND resumed_at IS NULL
  ORDER BY subscription_id, pause_start_date DESC
) ph
WHERE ph.subscription_id = s.id
  AND (s.pause_start_date IS NULL OR s.pause_until IS NULL);

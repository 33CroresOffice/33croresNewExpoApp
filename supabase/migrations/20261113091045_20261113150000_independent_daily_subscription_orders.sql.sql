/*
# Independent daily delivery records for subscription orders

1. Purpose
- Every active subscription must have one independent delivery order per
  applicable delivery date, each with its own fresh status. A previous day's
  Delivered / Picked Up / other status must never carry into a new day.
2. Data changes
- Removes duplicate order rows that share the same subscription and scheduled
  date (keeps the row with real progress, e.g. delivered, or the most recent).
  Verified before applying: none of the removed rows have rider assignments.
- Backfills missing fresh 'scheduled' orders for today and tomorrow for every
  active/renewed subscription (daily, monthly, 3-month and 6-month plans deliver
  every day; weekly/biweekly keep their existing cadence), skipping paused days
  and dates past the subscription end. Starting from the latest existing order
  date avoids flooding history with old dates.
3. Schema changes
- Adds a unique index on orders (subscription_id, scheduled_date) so duplicate
  daily records can never be created again.
4. Security
- No RLS or policy changes; triggers that auto-assign the primary rider to new
  orders fire normally during the backfill.
5. Important notes
- The rider delivery-location-verification trigger is unaffected.
- Idempotent: re-running inserts nothing (NOT EXISTS guards) and the unique
  index blocks duplicates.
*/

-- 1. Remove duplicate (subscription_id, scheduled_date) order rows.
--    Keep the row with real delivery progress, else the most recently created.
WITH dup_groups AS (
  SELECT subscription_id, scheduled_date
  FROM orders
  WHERE subscription_id IS NOT NULL
  GROUP BY 1, 2
  HAVING count(*) > 1
),
ranked AS (
  SELECT o.id,
         row_number() OVER (
           PARTITION BY o.subscription_id, o.scheduled_date
           ORDER BY CASE WHEN o.status <> 'scheduled' THEN 0 ELSE 1 END,
                    o.created_at DESC
         ) AS rn
  FROM orders o
  JOIN dup_groups g
    ON g.subscription_id = o.subscription_id
   AND g.scheduled_date = o.scheduled_date
)
DELETE FROM orders o
USING ranked r
WHERE o.id = r.id
  AND r.rn > 1;

-- 2. Guarantee one order per subscription per date going forward.
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_subscription_scheduled_date
  ON orders (subscription_id, scheduled_date)
  WHERE subscription_id IS NOT NULL;

-- 3. Backfill fresh today/tomorrow orders for active subscriptions.
INSERT INTO orders (subscription_id, user_id, scheduled_date, status)
SELECT s.id, s.user_id, d::date, 'scheduled'
FROM subscriptions s
JOIN subscription_plans p ON p.id = s.plan_id
CROSS JOIN generate_series(
  GREATEST(
    COALESCE((SELECT max(o.scheduled_date) FROM orders o WHERE o.subscription_id = s.id), s.start_date) + 1,
    CURRENT_DATE
  ),
  CURRENT_DATE + 1,
  '1 day'::interval
) AS d
WHERE s.status IN ('active', 'renewed')
  AND p.frequency NOT IN ('weekly', 'biweekly')
  AND (COALESCE(s.new_end_date, s.end_date) IS NULL OR COALESCE(s.new_end_date, s.end_date) >= d)
  AND NOT EXISTS (
    SELECT 1 FROM orders o
    WHERE o.subscription_id = s.id AND o.scheduled_date = d
  )
  AND NOT EXISTS (
    SELECT 1 FROM subscription_pause_history sph
    WHERE sph.subscription_id = s.id
      AND sph.is_cancelled = false
      AND d >= sph.pause_start_date
      AND d <= sph.pause_until
  );
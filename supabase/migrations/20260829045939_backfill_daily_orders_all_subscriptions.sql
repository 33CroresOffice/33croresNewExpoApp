/*
# Backfill daily orders for all active subscriptions with locality + apartment

1. Purpose
- Generate missing order rows for every active daily subscription that has a delivery
  address with locality_id and apartment_id set.
- Orders are created for every day from subscription start_date to end_date, EXCEPT
  days that fall within an active (non-cancelled) pause period.
- Existing orders are not duplicated (idempotent via NOT EXISTS check).
2. Subscriptions affected
- arpita (b29f18ea): 25 Aug – 23 Sep, paused 26–31 Aug
- arpita (7cece4b0): 1 Aug – 3 Sep, paused 21–24 Aug
- Prangya (281fc116): 27 Aug – 25 Sep, no pauses
3. next_delivery_date update
- After backfill, advance next_delivery_date for each subscription to the next
  non-paused day after today (29 Aug 2026).
4. Security
- No RLS or policy changes.
*/

-- Backfill missing orders, skipping paused days
INSERT INTO orders (subscription_id, user_id, scheduled_date, status)
SELECT s.id, s.user_id, d::date, 'scheduled'
FROM subscriptions s
CROSS JOIN generate_series(s.start_date::date, s.end_date::date, '1 day'::interval) AS d
WHERE s.id IN (
  'b29f18ea-3e9b-4056-8261-ad6647ece8c5',
  '7cece4b0-7375-499e-a53a-962192eb1d5b',
  '281fc116-7a05-4d34-bd0b-53cd80fc9b3c'
)
AND NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.subscription_id = s.id AND o.scheduled_date = d::date
)
AND NOT EXISTS (
  SELECT 1 FROM subscription_pause_history sph
  WHERE sph.subscription_id = s.id
  AND sph.is_cancelled = false
  AND d::date >= sph.pause_start_date
  AND d::date <= sph.pause_until
);

-- Update next_delivery_date to next non-paused day after today for each subscription
-- b29f18ea: paused 26-31 Aug → next is 1 Sep
UPDATE subscriptions SET next_delivery_date = '2026-09-01'
WHERE id = 'b29f18ea-3e9b-4056-8261-ad6647ece8c5';

-- 7cece4b0: paused 21-24 Aug (already past) → next is 30 Aug
UPDATE subscriptions SET next_delivery_date = '2026-08-30'
WHERE id = '7cece4b0-7375-499e-a53a-962192eb1d5b';

-- 281fc116: no pauses → next is 31 Aug (already set, but ensure)
UPDATE subscriptions SET next_delivery_date = '2026-08-31'
WHERE id = '281fc116-7a05-4d34-bd0b-53cd80fc9b3c';

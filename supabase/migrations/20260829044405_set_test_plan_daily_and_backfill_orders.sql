/*
# Set Test Plan to daily frequency and backfill missing orders

1. Changes
- Update the "Test Plan" subscription plan frequency from 'monthly' to 'daily'.
- This means every non-paused day between subscription start_date and end_date gets a delivery order.
2. Backfill
- Insert missing order rows for subscription 281fc116 (Prangya, 27 Aug – 25 Sep) for dates 28 Aug through 30 Aug 2026.
- These orders were not generated because the plan was previously 'monthly'.
- Only insert if no order already exists for that date (idempotent).
3. Advance next_delivery_date to 31 Aug so the next run picks up from there.
4. Security
- No RLS or policy changes.
*/

-- Set the plan to daily
UPDATE subscription_plans
SET frequency = 'daily'
WHERE name = 'Test Plan';

-- Backfill missing orders for Prangya's subscription (28 Aug – 30 Aug)
INSERT INTO orders (subscription_id, user_id, scheduled_date, status)
SELECT '281fc116-7a05-4d34-bd0b-53cd80fc9b3c', user_id, d::date, 'scheduled'
FROM subscriptions, generate_series('2026-08-28'::date, '2026-08-30'::date, '1 day'::interval) AS d
WHERE subscriptions.id = '281fc116-7a05-4d34-bd0b-53cd80fc9b3c'
AND NOT EXISTS (
  SELECT 1 FROM orders o
  WHERE o.subscription_id = '281fc116-7a05-4d34-bd0b-53cd80fc9b3c'
  AND o.scheduled_date = d::date
);

-- Advance next_delivery_date to 31 Aug
UPDATE subscriptions
SET next_delivery_date = '2026-08-31'
WHERE id = '281fc116-7a05-4d34-bd0b-53cd80fc9b3c';

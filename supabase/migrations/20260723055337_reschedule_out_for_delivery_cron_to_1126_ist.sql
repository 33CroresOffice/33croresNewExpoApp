/*
# Reschedule "Out for Delivery" cron from 11:10 AM to 11:26 AM IST

1. Changes
   - The existing pg_cron job `mark-orders-out-for-delivery` currently runs at `40 5 * * *` (05:40 UTC = 11:10 AM IST).
   - This migration reschedules it to `56 5 * * *` (05:56 UTC = 11:26 AM IST).
   - The SQL command itself is unchanged — it still marks `orders` with `status='scheduled'` and `scheduled_date = CURRENT_DATE` to `out_for_delivery`.

2. Why
   - Admin wants the "Out for Delivery" status transition to happen at 11:26 AM IST instead of 11:10 AM IST.

3. Important Notes
   - Drops and recreates the cron job with the new schedule (idempotent via DROP IF EXISTS).
   - The UPDATE command is identical to the original.
*/

SELECT cron.unschedule('mark-orders-out-for-delivery');

SELECT cron.schedule(
  'mark-orders-out-for-delivery',
  '56 5 * * *',
  $$
  UPDATE orders
  SET status = 'out_for_delivery'
  WHERE status = 'scheduled'
    AND scheduled_date = CURRENT_DATE;
  $$
);

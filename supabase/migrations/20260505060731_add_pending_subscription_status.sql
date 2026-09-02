/*
  # Add 'pending' to subscriptions status

  ## Summary
  Adds a new 'pending' status value to the subscriptions table for subscriptions
  that have been paid for but have a future start_date (not yet active).

  ## Changes
  - Drops and recreates the `subscriptions_status_check` constraint to include 'pending'

  ## Notes
  - Pending subscriptions are automatically activated by the daily cron job when
    their start_date becomes today (IST timezone)
*/

ALTER TABLE subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'paused'::text, 'cancelled'::text, 'expired'::text, 'renewed'::text]));

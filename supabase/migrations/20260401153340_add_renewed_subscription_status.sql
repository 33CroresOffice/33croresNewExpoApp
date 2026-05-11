/*
  # Add 'renewed' subscription status

  ## Summary
  Adds 'renewed' as a valid value for the subscriptions.status column.

  ## Changes
  - Modified Tables
    - `subscriptions`: status check constraint updated to include 'renewed'

  ## Notes
  A subscription with status 'renewed' has been superseded by a new renewal
  subscription. Its deliveries continue until its original end_date, after
  which the new subscription takes over. This status allows the UI to clearly
  distinguish these subscriptions from ones that expired or were cancelled.
*/

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'paused', 'cancelled', 'expired', 'renewed'));

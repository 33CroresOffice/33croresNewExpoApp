/*
  # Fix renewal_status Check Constraint

  ## Summary
  The renewal_status check constraint was created without the 'expired' value.
  This migration drops and recreates it with the full set of allowed values:
  none, notified, expired, renewed.
*/

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_renewal_status_check;

ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_renewal_status_check
  CHECK (renewal_status IN ('none', 'notified', 'expired', 'renewed'));

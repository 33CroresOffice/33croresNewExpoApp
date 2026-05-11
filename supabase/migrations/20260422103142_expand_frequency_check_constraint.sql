/*
  # Expand frequency check constraint on subscription_plans

  The existing constraint only allowed 'weekly', 'biweekly', 'monthly'.
  The UI also offers '3months' and '6months' as valid options.
  This migration expands the constraint to include all supported frequencies.
*/

ALTER TABLE subscription_plans
  DROP CONSTRAINT subscription_plans_frequency_check;

ALTER TABLE subscription_plans
  ADD CONSTRAINT subscription_plans_frequency_check
  CHECK (frequency = ANY (ARRAY['weekly', 'biweekly', 'monthly', '3months', '6months']));

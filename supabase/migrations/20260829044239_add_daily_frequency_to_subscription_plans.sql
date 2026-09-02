/*
# Add daily frequency to subscription plans

1. Changes
- Expand the `frequency` CHECK constraint on `subscription_plans` to include `'daily'`.
- This allows plans that deliver every non-paused day between the subscription start and end date.
2. Security
- No RLS or policy changes.
3. Important notes
- The generate-orders edge function must also handle `'daily'` frequency (next_delivery_date advances by 1 day).
- Existing plans are unaffected; only plans explicitly set to `'daily'` will use daily delivery.
*/

ALTER TABLE subscription_plans DROP CONSTRAINT IF EXISTS subscription_plans_frequency_check;

ALTER TABLE subscription_plans ADD CONSTRAINT subscription_plans_frequency_check
  CHECK (frequency = ANY (ARRAY['daily', 'weekly', 'biweekly', 'monthly', '3months', '6months']));

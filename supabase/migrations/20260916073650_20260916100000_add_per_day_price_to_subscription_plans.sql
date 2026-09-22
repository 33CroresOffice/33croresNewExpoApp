/*
# Add per-day pricing to subscription plans

1. New Columns
- `subscription_plans.per_day_price` (integer, paise): the required per-day customer price for a plan.

2. Modified Tables
- `subscription_plans`: adds the per-day price without changing or removing any existing columns or data.
- Existing plans are backfilled with `0` paise so the new non-null column can be introduced safely. Administrators can update each plan through the plan editor.

3. Security
- No RLS or policy changes are needed. The existing subscription-plan access rules remain unchanged.

4. Important Notes
- Prices continue to use integer paise, matching the existing `price` and `mrp_price` columns.
- The admin create/edit form validates that new and updated plans provide a positive per-day price.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscription_plans'
      AND column_name = 'per_day_price'
  ) THEN
    ALTER TABLE public.subscription_plans
      ADD COLUMN per_day_price integer NOT NULL DEFAULT 0;
  END IF;
END $$;

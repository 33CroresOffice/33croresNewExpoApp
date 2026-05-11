/*
  # Add custom_orders_count to daily_requirements

  ## Changes
  - Adds `custom_orders_count` integer column (default 0) to `daily_requirements`
    to separately track how many custom orders contribute to the flower quantity
    for a given date, alongside `active_subscriptions_count` for subscriptions.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_requirements' AND column_name = 'custom_orders_count'
  ) THEN
    ALTER TABLE daily_requirements ADD COLUMN custom_orders_count integer NOT NULL DEFAULT 0;
  END IF;
END $$;

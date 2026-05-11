/*
  # Add MRP Price and New Frequency Options to Subscription Plans

  ## Changes
  1. New column `mrp_price` (integer, paise) on `subscription_plans`
     - Stores the original/list price before discount
     - Selling price remains in the existing `price` column
     - mrp_price defaults to 0 (no MRP set)
  2. Frequency type expansion
     - The existing `frequency` column is text; adds support for '3months' and '6months' values
     - No schema change required since column is already text type
  3. Backfill: sets mrp_price = price for all existing plans so no null values exist
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'mrp_price'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN mrp_price integer NOT NULL DEFAULT 0;
  END IF;
END $$;

UPDATE subscription_plans SET mrp_price = price WHERE mrp_price = 0 AND price > 0;

/*
  # Add show_in_customer_plans to subscription_plans

  Adds a boolean column `show_in_customer_plans` that controls whether a plan
  is visible on the customer-facing Plans page. Defaults to true so all existing
  active plans continue to show.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'show_in_customer_plans'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN show_in_customer_plans boolean NOT NULL DEFAULT true;
  END IF;
END $$;

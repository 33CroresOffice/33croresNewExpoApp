/*
  # Add cancel_reason to custom_orders

  Adds an optional text column `cancel_reason` to the `custom_orders` table.
  When a customer cancels their order, they must provide a reason which is
  stored here and shown to admin in the order detail panel.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'cancel_reason'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN cancel_reason text;
  END IF;
END $$;

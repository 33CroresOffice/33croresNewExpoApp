/*
  # Add pickup rider assignment to procurement orders

  ## Changes
  - New column `pickup_rider_id` (uuid, nullable FK → riders) on `procurement_orders`
  - New column `pickup_notes` (text, nullable) on `procurement_orders`
  - New column `pickup_assigned_at` (timestamptz, nullable) on `procurement_orders`

  ## Purpose
  Allows admin to assign a rider to physically pick up goods from a vendor
  once a procurement order is in `accepted` status.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_orders' AND column_name = 'pickup_rider_id'
  ) THEN
    ALTER TABLE procurement_orders ADD COLUMN pickup_rider_id uuid REFERENCES riders(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_orders' AND column_name = 'pickup_notes'
  ) THEN
    ALTER TABLE procurement_orders ADD COLUMN pickup_notes text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'procurement_orders' AND column_name = 'pickup_assigned_at'
  ) THEN
    ALTER TABLE procurement_orders ADD COLUMN pickup_assigned_at timestamptz;
  END IF;
END $$;

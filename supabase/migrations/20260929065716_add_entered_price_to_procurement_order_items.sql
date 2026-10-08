/*
  # Add entered_price to procurement_order_items

  ## Summary
  The `total_price` column is a GENERATED column computed as `quantity * price_per_unit`.
  When a vendor/rider/admin enters a total price like ₹35 for 3 units, the code divides
  to get the unit price (₹11.67), then the DB recomputes `3 × 11.67 = ₹35.01`, losing
  the exact entered amount.

  This migration adds an `entered_price` column that stores the exact total the user typed,
  so it can be displayed back without any rounding or normalization.

  ## Changes
  1. Adds `entered_price numeric(12,2)` to `procurement_order_items`
  2. Drops and recreates the generated `total_price` column to prefer `entered_price`
  3. Drops and recreates `update_vendor_item_price` RPC with new signature
  4. Drops and recreates `update_pickup_item_prices` RPC with new signature

  ## Notes
  - `total_price` is a generated column (no user data stored), safe to recreate
  - Backward compatible: `entered_price` defaults to NULL, old code still works
*/

-- Step 1: Add entered_price column
ALTER TABLE procurement_order_items
  ADD COLUMN IF NOT EXISTS entered_price numeric(12,2);

-- Step 2: Backfill entered_price from existing total_price for rows that already have prices
UPDATE procurement_order_items
SET entered_price = total_price
WHERE price_per_unit IS NOT NULL AND entered_price IS NULL;

-- Step 3: Drop the old generated total_price and recreate with entered_price preference
ALTER TABLE procurement_order_items
  DROP COLUMN total_price,
  ADD COLUMN total_price numeric(12,2)
  GENERATED ALWAYS AS (
    COALESCE(entered_price, quantity * COALESCE(price_per_unit, 0))
  ) STORED;

-- Step 4: Drop and recreate vendor RPC with new signature
DROP FUNCTION IF EXISTS update_vendor_item_price(uuid, numeric(10,2));
DROP FUNCTION IF EXISTS update_vendor_item_price(uuid, numeric(10,2), numeric(12,2));

CREATE OR REPLACE FUNCTION update_vendor_item_price(
  p_item_id uuid,
  p_price_per_unit numeric(10,2),
  p_entered_price numeric(12,2) DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM procurement_order_items poi
    JOIN procurement_orders po ON po.id = poi.procurement_order_id
    JOIN vendors v ON v.id = po.vendor_id
    WHERE poi.id = p_item_id
      AND v.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this item';
  END IF;

  UPDATE procurement_order_items
  SET price_per_unit = p_price_per_unit,
      entered_price = p_entered_price,
      price_set_by = 'vendor'
  WHERE id = p_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_vendor_item_price(uuid, numeric(10,2), numeric(12,2)) FROM anon;
GRANT EXECUTE ON FUNCTION update_vendor_item_price(uuid, numeric(10,2), numeric(12,2)) TO authenticated;

-- Step 5: Drop and recreate rider pickup RPC with new signature
DROP FUNCTION IF EXISTS update_pickup_item_prices(uuid, numeric(10,2), numeric(12,2));
DROP FUNCTION IF EXISTS update_pickup_item_prices(uuid, numeric(10,2), numeric(12,2), numeric(12,2));

CREATE OR REPLACE FUNCTION update_pickup_item_prices(
  p_item_id uuid,
  p_price_per_unit numeric(10,2),
  p_total_price numeric(12,2) DEFAULT 0,
  p_entered_price numeric(12,2) DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_set_by text;
BEGIN
  SELECT price_set_by INTO v_existing_set_by
  FROM procurement_order_items WHERE id = p_item_id;

  IF v_existing_set_by = 'vendor' THEN
    RAISE EXCEPTION 'This price was set by the vendor and cannot be edited';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM procurement_order_items poi
    JOIN procurement_orders po ON po.id = poi.procurement_order_id
    JOIN riders r ON r.id = po.pickup_rider_id
    WHERE poi.id = p_item_id
      AND r.profile_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Not authorized to update this item';
  END IF;

  UPDATE procurement_order_items
  SET price_per_unit = p_price_per_unit,
      entered_price = p_entered_price,
      price_set_by = 'rider'
  WHERE id = p_item_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION update_pickup_item_prices(uuid, numeric(10,2), numeric(12,2), numeric(12,2)) FROM anon;
GRANT EXECUTE ON FUNCTION update_pickup_item_prices(uuid, numeric(10,2), numeric(12,2), numeric(12,2)) TO authenticated;

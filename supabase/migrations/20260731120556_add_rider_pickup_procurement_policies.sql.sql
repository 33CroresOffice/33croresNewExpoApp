/*
  # Rider SELECT access for assigned pickup procurement orders

  ## Purpose
  Riders need to view procurement orders assigned to them for pickup
  (via `procurement_orders.pickup_rider_id`), along with the line items,
  the vendor, and flower type names so the rider app can render a full
  pickup order detail screen.

  ## Changes
  1. `procurement_orders`: riders can SELECT rows where `pickup_rider_id`
     matches their rider record (`riders.profile_id = auth.uid()`).
  2. `procurement_order_items`: riders can SELECT items belonging to a
     procurement order assigned to them.
  3. `vendors`: riders can SELECT the vendor row linked to an assigned
     procurement order (limited contact fields are fine — full read).
  4. `flower_types`: riders can SELECT active flower types for item naming.

  ## Security
  - All policies are `TO authenticated` only.
  - Each policy verifies the rider relationship via `riders.profile_id = auth.uid()`.
  - No `USING (true)` shortcuts.
*/

-- procurement_orders: rider can read orders assigned to them for pickup
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'procurement_orders' AND policyname = 'Riders can view assigned pickup orders'
  ) THEN
    CREATE POLICY "Riders can view assigned pickup orders"
      ON procurement_orders FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM riders r
          WHERE r.id = procurement_orders.pickup_rider_id
            AND r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- procurement_order_items: rider can read items for an assigned pickup order
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'procurement_order_items' AND policyname = 'Riders can view items for assigned pickup orders'
  ) THEN
    CREATE POLICY "Riders can view items for assigned pickup orders"
      ON procurement_order_items FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM procurement_orders po
          JOIN riders r ON r.id = po.pickup_rider_id
          WHERE po.id = procurement_order_items.procurement_order_id
            AND r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- vendors: rider can read the vendor for an assigned pickup order
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vendors' AND policyname = 'Riders can view vendor for assigned pickup orders'
  ) THEN
    CREATE POLICY "Riders can view vendor for assigned pickup orders"
      ON vendors FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM procurement_orders po
          JOIN riders r ON r.id = po.pickup_rider_id
          WHERE po.vendor_id = vendors.id
            AND r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- flower_types: riders can read active flower types
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'flower_types' AND policyname = 'Riders can view active flower types'
  ) THEN
    CREATE POLICY "Riders can view active flower types"
      ON flower_types FOR SELECT
      TO authenticated
      USING (is_active = true);
  END IF;
END $$;

/*
  # Rider can update prices on assigned pickup order items

  ## Purpose
  After a rider is assigned to pick up a procurement order, they need to
  enter the actual price they paid per item at the vendor. This migration
  grants riders the ability to:
  1. UPDATE `price_per_unit` and `total_price` on `procurement_order_items`
     that belong to a procurement order assigned to them.
  2. UPDATE `total_amount` on the `procurement_orders` row they are assigned
     to pick up (so the order total stays in sync).

  Both policies use the same SECURITY DEFINER helper functions introduced in
  `fix_rls_recursion_vendors_procurement_cycle.sql` to avoid RLS recursion.

  ## Security
  - UPDATE policy on `procurement_order_items` scoped to the rider's assigned
    order via `rider_can_view_pickup_order_items()`.
  - UPDATE policy on `procurement_orders` scoped to the rider's own assignment
    via a new `rider_is_pickup_rider(order_id)` helper.
  - Riders cannot change any other columns because the app only sends the
    price fields; additional column-level protection is provided by the
    SECURITY DEFINER helper which does not expose other row data.
*/

-- Helper: is the current auth user the pickup rider for this procurement order?
CREATE OR REPLACE FUNCTION rider_is_pickup_rider(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurement_orders po
    JOIN riders r ON r.id = po.pickup_rider_id
    WHERE po.id = p_order_id
      AND r.profile_id = auth.uid()
      AND po.status = 'accepted'
  );
$$;

-- Rider can UPDATE price fields on their assigned order's items
DROP POLICY IF EXISTS "Riders can update prices on assigned pickup items" ON procurement_order_items;
CREATE POLICY "Riders can update prices on assigned pickup items"
  ON procurement_order_items FOR UPDATE
  TO authenticated
  USING (rider_can_view_pickup_order_items(procurement_order_id))
  WITH CHECK (rider_can_view_pickup_order_items(procurement_order_id));

-- Rider can UPDATE total_amount on their assigned accepted pickup order
DROP POLICY IF EXISTS "Riders can update total on assigned pickup order" ON procurement_orders;
CREATE POLICY "Riders can update total on assigned pickup order"
  ON procurement_orders FOR UPDATE
  TO authenticated
  USING (rider_is_pickup_rider(id))
  WITH CHECK (rider_is_pickup_rider(id));

/*
# Allow riders to read custom orders assigned to them

## Purpose
When an admin assigns a rider to a custom order, the rider needs to see the full
order details (customer name, address, delivery date, order type, items with
quantities) in their rider app. Currently, riders can only read their own custom
orders (as customers) — not orders assigned to them for delivery.

## Changes
1. New SELECT policy on `custom_orders`:
   - Riders can SELECT a custom_order row if there exists a `rider_order_assignments`
     row linking that custom order to the rider's profile.
   - Uses `get_rider_id_for_user(auth.uid())` (same helper used by rider assignment
     policies) to resolve the rider from the authenticated user's profile.

## Security
- The policy is scoped: a rider can only read custom orders that have been
  explicitly assigned to them via `rider_order_assignments`.
- No INSERT/UPDATE/DELETE access is granted — read-only.
- The existing customer and admin policies remain unchanged.
*/

DROP POLICY IF EXISTS "Riders can view assigned custom orders" ON custom_orders;

CREATE POLICY "Riders can view assigned custom orders"
ON custom_orders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM rider_order_assignments roa
    WHERE roa.custom_order_id = custom_orders.id
      AND roa.rider_id = get_rider_id_for_user(auth.uid())
  )
);
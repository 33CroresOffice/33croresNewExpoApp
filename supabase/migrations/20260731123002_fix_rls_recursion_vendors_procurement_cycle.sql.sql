/*
  # Fix RLS recursion cycle between vendors and procurement_orders

  ## Problem
  The previous migration `add_rider_pickup_procurement_policies.sql` added a
  SELECT policy on `vendors` that subqueries `procurement_orders`, and a
  SELECT policy on `procurement_order_items` that also subqueries
  `procurement_orders`. The existing "Admins can view all procurement orders"
  policy on `procurement_orders` subqueries `vendors` (to let vendor-linked
  auth users see their own orders). This creates an infinite RLS recursion:

      vendors → procurement_orders → vendors → ...

  Postgres detects the cycle and returns zero rows, so the admin's vendor
  dropdown in the New Procurement Order modal appears empty.

  ## Fix
  Replace the two recursive rider policies with versions that call
  SECURITY DEFINER functions instead of inline subqueries. A SECURITY
  DEFINER function runs with the owner's privileges and bypasses RLS,
  breaking the recursion cycle while keeping the same ownership check.

  ### New Functions
  - `rider_can_view_pickup_vendor(p_vendor_id uuid)`: returns true if the
    current auth user is a rider assigned to a procurement order that uses
    this vendor.
  - `rider_can_view_pickup_order_items(p_procurement_order_id uuid)`:
    returns true if the current auth user is a rider assigned to this
    procurement order.

  Both are `SECURITY DEFINER`, `STABLE`, owned by the postgres role, so
  they bypass RLS on the tables they read.

  ## Security
  - Each function verifies `riders.profile_id = auth.uid()` so only the
    assigned rider passes the check.
  - No `USING (true)` shortcuts.
*/

-- ─── Helper function: rider can view a vendor for an assigned pickup order ──
CREATE OR REPLACE FUNCTION rider_can_view_pickup_vendor(p_vendor_id uuid)
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
    WHERE po.vendor_id = p_vendor_id
      AND r.profile_id = auth.uid()
  );
$$;

-- ─── Helper function: rider can view items for an assigned pickup order ──────
CREATE OR REPLACE FUNCTION rider_can_view_pickup_order_items(p_procurement_order_id uuid)
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
    WHERE po.id = p_procurement_order_id
      AND r.profile_id = auth.uid()
  );
$$;

-- ─── Replace recursive vendor policy with function-based one ─────────────────
DROP POLICY IF EXISTS "Riders can view vendor for assigned pickup orders" ON vendors;
CREATE POLICY "Riders can view vendor for assigned pickup orders"
  ON vendors FOR SELECT
  TO authenticated
  USING (rider_can_view_pickup_vendor(vendors.id));

-- ─── Replace recursive procurement_order_items policy with function-based one ─
DROP POLICY IF EXISTS "Riders can view items for assigned pickup orders" ON procurement_order_items;
CREATE POLICY "Riders can view items for assigned pickup orders"
  ON procurement_order_items FOR SELECT
  TO authenticated
  USING (rider_can_view_pickup_order_items(procurement_order_items.procurement_order_id));

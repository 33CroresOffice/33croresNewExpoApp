/*
# Fix "Customers can view assigned riders" RLS policy to avoid recursion

## Why
The existing "Customers can view assigned riders" policy on `riders` uses a
subquery through `rider_order_assignments` which calls `order_owner_uid()`.
When PostgREST evaluates a nested join (orders -> rider_order_assignments ->
riders), it must pass RLS on `riders` for each row. The policy re-enters the
`rider_order_assignments` RLS check, which re-enters `orders` RLS. This
multi-level chain causes the rider data to return as `null` for customers.

## What this does
Replaces the "Customers can view assigned riders" policy with one that uses
a SECURITY DEFINER function `customer_can_view_rider(rider_uuid uuid)` that
checks whether the authenticated user owns any order or custom order that
has an assignment with this rider. The function bypasses RLS, so there is no
recursion.

## Security
- The new function is SECURITY DEFINER and only checks ownership — it does
  not expose any data.
- Granted EXECUTE to `authenticated` only.
- The policy still enforces that only customers with assigned riders can read.
- No data changes.
*/

CREATE OR REPLACE FUNCTION public.customer_can_view_rider(rider_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rider_order_assignments roa
    WHERE roa.rider_id = $1
      AND (
        (roa.order_id IS NOT NULL AND order_owner_uid(roa.order_id) = auth.uid())
        OR
        (roa.custom_order_id IS NOT NULL AND custom_order_owner_uid(roa.custom_order_id) = auth.uid())
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.customer_can_view_rider(uuid) TO authenticated;

DROP POLICY IF EXISTS "Customers can view assigned riders" ON riders;
CREATE POLICY "Customers can view assigned riders"
  ON riders FOR SELECT
  TO authenticated
  USING (customer_can_view_rider(riders.id));

/*
# Allow customers to view their subscription's standing (primary) rider

1. Purpose
- In the customer app's Delivery History, every delivery date of an active
  subscription should show the assigned rider's name and mobile number, even
  on dates that have no individual order/assignment yet. The standing rider
  is stored on `subscriptions.primary_rider_id`.

2. Problem
- Customers can currently read a rider's row only when that rider has an
  assignment on one of the customer's orders or custom orders (via the
  SECURITY DEFINER function `customer_can_view_rider`). A rider who is only
  the standing rider on the customer's subscription is invisible to the
  customer, so embedded joins on `subscriptions.primary_rider_id -> riders`
  return null on the client.

3. What this does
- Replaces the `customer_can_view_rider(rider_uuid uuid)` SECURITY DEFINER
  function, adding one more allowed case: the rider is the `primary_rider_id`
  of a subscription owned by the authenticated user. The existing
  assignment-based cases are kept unchanged.

4. Security
- The function remains SECURITY DEFINER and only performs an ownership check;
  it exposes no rider data by itself.
- A customer can still only ever resolve riders tied to their OWN
  subscriptions or their OWN orders.
- EXECUTE is granted to `authenticated` only, as before.
- The "Customers can view assigned riders" policy on `riders` already calls
  this function, so no policy change is needed. No data changes.
*/

CREATE OR REPLACE FUNCTION public.customer_can_view_rider(rider_uuid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM subscriptions s
    WHERE s.primary_rider_id = $1
      AND s.user_id = auth.uid()
  ) OR EXISTS (
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

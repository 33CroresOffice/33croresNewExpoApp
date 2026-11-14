/*
# Make carried-forward riders visible on order details

## Plain-English summary
The subscription renewal rule already remembers the customer's previous rider in
`subscriptions.primary_rider_id`. The admin Order Details screen, however,
shows the rider from `rider_order_assignments`, which is the actual delivery
assignment. This migration connects those two records without changing any
existing delivery history.

## 1. Modified behavior
- When an active subscription has a primary rider, every newly created order
  for that subscription receives a rider order assignment for that rider.
- When a pending subscription becomes active, its existing unassigned orders
  receive the carried-forward rider.
- The process is idempotent and only creates an assignment when the order has no
  current assignment.
- Explicit assignments and all completed, failed, or reassigned history remain
  unchanged.

## 2. Existing data protection
- No existing assignment rows are updated or deleted.
- No order status, delivery date, rider history, or delivery timestamps are
  changed by the backfill.
- The one-time backfill only inserts missing assignments for active subscriptions
  that already have a primary rider.

## 3. Security
- The internal trigger function runs as `SECURITY DEFINER` with
  `search_path = public`.
- Direct execution is revoked from PUBLIC, anon, and authenticated roles.
- The trigger performs only the same internal assignment operation used by the
  existing auto-assignment system.

## 4. Important notes
1. The previous subscription and its delivery history remain untouched.
2. A rider manually assigned to a new order is never overwritten.
3. If no prior rider exists, the existing auto-assignment process continues to
   handle the order normally.
*/

CREATE OR REPLACE FUNCTION public.assign_primary_rider_to_subscription_orders()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.status NOT IN ('active', 'renewed') OR NEW.primary_rider_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO rider_order_assignments (
    rider_id,
    order_id,
    status,
    notes,
    auto_assigned
  )
  SELECT
    NEW.primary_rider_id,
    o.id,
    'assigned',
    'Primary rider assignment',
    true
  FROM orders o
  WHERE o.subscription_id = NEW.id
    AND NOT EXISTS (
      SELECT 1
      FROM rider_order_assignments roa
      WHERE roa.order_id = o.id
        AND roa.status NOT IN ('delivered', 'failed', 'reassigned')
    );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assign_primary_rider_to_orders_on_subscription_change ON public.subscriptions;
CREATE TRIGGER assign_primary_rider_to_orders_on_subscription_change
AFTER INSERT OR UPDATE OF status, primary_rider_id ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.assign_primary_rider_to_subscription_orders();

CREATE OR REPLACE FUNCTION public.assign_primary_rider_to_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_primary_rider_id uuid;
  v_subscription_status text;
BEGIN
  SELECT s.primary_rider_id, s.status
  INTO v_primary_rider_id, v_subscription_status
  FROM subscriptions s
  WHERE s.id = NEW.subscription_id;

  IF v_subscription_status IN ('active', 'renewed') AND v_primary_rider_id IS NOT NULL THEN
    INSERT INTO rider_order_assignments (
      rider_id,
      order_id,
      status,
      notes,
      auto_assigned
    )
    SELECT
      v_primary_rider_id,
      NEW.id,
      'assigned',
      'Primary rider assignment',
      true
    WHERE NOT EXISTS (
      SELECT 1
      FROM rider_order_assignments roa
      WHERE roa.order_id = NEW.id
        AND roa.status NOT IN ('delivered', 'failed', 'reassigned')
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS assign_primary_rider_on_order_insert ON public.orders;
CREATE TRIGGER assign_primary_rider_on_order_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_primary_rider_to_new_order();

INSERT INTO rider_order_assignments (
  rider_id,
  order_id,
  status,
  notes,
  auto_assigned
)
SELECT
  s.primary_rider_id,
  o.id,
  'assigned',
  'Primary rider assignment',
  true
FROM subscriptions s
JOIN orders o ON o.subscription_id = s.id
WHERE s.status IN ('active', 'renewed')
  AND s.primary_rider_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM rider_order_assignments roa
    WHERE roa.order_id = o.id
      AND roa.status NOT IN ('delivered', 'failed', 'reassigned')
  );

REVOKE EXECUTE ON FUNCTION public.assign_primary_rider_to_subscription_orders() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.assign_primary_rider_to_new_order() FROM PUBLIC, anon, authenticated;

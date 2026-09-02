/*
# Sync parent order status when rider assignment status changes

## Why
When a rider marks an assignment as 'delivered' or 'failed' in
`rider_order_assignments`, only the assignment row is updated.
The parent `orders` or `custom_orders` row keeps its old status
(e.g. 'out_for_delivery'), so the customer's Delivery History page
never reflects the delivered state.

## What this does
Creates a trigger function `sync_order_status_from_assignment()`
and an AFTER UPDATE trigger on `rider_order_assignments` that:
  - When assignment.status becomes 'delivered': sets the parent
    `orders.status = 'delivered'` and `orders.delivered_at = now()`
    (if order_id is not null), OR sets the parent
    `custom_orders.status = 'delivered'` and
    `custom_orders.delivered_at = now()` (if custom_order_id is not null).
  - When assignment.status becomes 'failed': sets the parent
    `orders.status = 'failed'` (or `custom_orders.status = 'cancelled'`,
    since custom_orders has no 'failed' status).

## Safety
- Idempotent: uses DROP IF EXISTS before CREATE.
- Only fires when status actually changes to 'delivered' or 'failed'.
- No RLS changes.
*/

CREATE OR REPLACE FUNCTION sync_order_status_from_assignment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Only act when the assignment status transitions to delivered or failed
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'delivered' THEN
      -- Update parent subscription order
      IF NEW.order_id IS NOT NULL THEN
        UPDATE orders
          SET status = 'delivered',
              delivered_at = COALESCE(delivered_at, NEW.delivered_at, now())
          WHERE id = NEW.order_id AND status <> 'delivered';
      END IF;
      -- Update parent custom order
      IF NEW.custom_order_id IS NOT NULL THEN
        UPDATE custom_orders
          SET status = 'delivered',
              delivered_at = COALESCE(delivered_at, NEW.delivered_at, now())
          WHERE id = NEW.custom_order_id AND status <> 'delivered';
      END IF;
    ELSIF NEW.status = 'failed' THEN
      IF NEW.order_id IS NOT NULL THEN
        UPDATE orders
          SET status = 'failed'
          WHERE id = NEW.order_id AND status <> 'failed';
      END IF;
      -- custom_orders has no 'failed' status, leave as-is
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_order_status_on_assignment_update
  ON rider_order_assignments;

CREATE TRIGGER sync_order_status_on_assignment_update
  AFTER UPDATE ON rider_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION sync_order_status_from_assignment();

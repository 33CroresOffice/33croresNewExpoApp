/*
# Keep the subscription's primary rider in sync with every assignment path

1. Plain-English summary
- The Admin "Assigned Orders" page lists customers by each subscription's
  primary (standing) rider. Some flows that create or change daily
  assignments recorded the rider only on the day's order, so when that
  order was delivered the subscription lost its rider and vanished from
  the page. Others cleared the standing rider as a side effect of
  ending or re-linking a subscription.
- A database trigger now keeps the standing rider in sync automatically:
  whenever a daily assignment is created for a subscription without a
  standing rider (or with a different one), that rider becomes the
  subscription's primary rider. When admin marks an assignment
  "reassigned" (unassign/reassign), the trigger also clears the standing
  rider so the customer leaves the Assigned list as intended.
- A backfill restores the standing rider for every subscription that
  currently has an assigned or delivered order but no standing rider, so
  customers already served by a rider reappear on the page.

2. New trigger
- `sync_subscription_primary_rider` on `rider_order_assignments`:
  runs after insert or update.
  - INSERT with status in (assigned, accepted, picked_up, delivered) and
    the subscription's primary_rider_id is NULL or different -> set it to
    the assignment's rider.
  - UPDATE to status 'reassigned' -> clear the subscription's
    primary_rider_id (admin deliberately ended the standing assignment).

3. Backfill
- subscriptions.primary_rider_id is filled from each subscription's most
  recent assignment that is not failed/reassigned, only where currently
  NULL. No existing values are overwritten.

4. Security
- No RLS changes. The trigger is a plain internal function.
*/

CREATE OR REPLACE FUNCTION sync_subscription_primary_rider()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status IN ('assigned', 'accepted', 'picked_up', 'delivered') THEN
      UPDATE subscriptions
      SET primary_rider_id = NEW.rider_id
      WHERE id = (
        SELECT o.subscription_id FROM orders o WHERE o.id = NEW.order_id
      )
      AND (primary_rider_id IS NULL OR primary_rider_id <> NEW.rider_id);
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'reassigned' AND OLD.status <> 'reassigned' THEN
      UPDATE subscriptions
      SET primary_rider_id = NULL
      WHERE id = (
        SELECT o.subscription_id FROM orders o WHERE o.id = NEW.order_id
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subscription_primary_rider ON rider_order_assignments;
CREATE TRIGGER trg_sync_subscription_primary_rider
AFTER INSERT OR UPDATE OF status, rider_id, order_id ON rider_order_assignments
FOR EACH ROW EXECUTE FUNCTION sync_subscription_primary_rider();

UPDATE subscriptions s
SET primary_rider_id = (
  SELECT roa.rider_id
  FROM rider_order_assignments roa
  JOIN orders o ON o.id = roa.order_id
  WHERE o.subscription_id = s.id
    AND roa.status NOT IN ('reassigned')
  ORDER BY roa.assigned_at DESC
  LIMIT 1
)
WHERE s.primary_rider_id IS NULL
  AND EXISTS (
    SELECT 1 FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    WHERE o.subscription_id = s.id
      AND roa.status IN ('assigned', 'accepted', 'picked_up', 'delivered')
  );

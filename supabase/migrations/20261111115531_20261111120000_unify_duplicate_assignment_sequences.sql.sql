/*
# Unify delivery sequence numbers across duplicate assignment rows

## Why

Each customer's subscription can have many `rider_order_assignments` rows (one per
historical daily order) that all share the exact same `assigned_at` timestamp. When the
admin sets a delivery sequence, only ONE of those duplicate rows gets the number. The
admin panel and the rider app each pick a "current" row per subscription with slightly
different tie-breaking, so they can surface different duplicate rows — the rider app
then shows stale or missing sequence numbers (e.g. 1, 1, 2, 4 instead of 1, 2, 3, 4).

## What this migration does

1. Data repair (one-time, runs on apply): for every rider + subscription pair that has
   duplicate rows carrying conflicting sequence numbers, copy the most recently updated
   non-null sequence onto all other rows of the same pair, then renumber each rider's
   eligible customers 1..n with no gaps or duplicates (ordered by sequence, then
   scheduled date, then assigned time). Only rows in assigned/accepted/picked_up/delivered
   status participate, and only subscriptions that are currently active for delivery
   (matching the admin panel's sequencing rules).
2. Trigger `sync_assignment_delivery_sequence`: keeps every duplicate row of the same
   rider + subscription in lock-step. When an admin edits one row's `delivery_sequence`
   (the admin panel edits a single row), all sibling duplicate rows for the same
   rider + subscription immediately receive the same number, so both apps always agree
   regardless of which duplicate row they display.

## Tables and columns changed

- `rider_order_assignments`: no schema change. One-time data update plus a new
  BEFORE UPDATE trigger `sync_assignment_delivery_sequence`.

## Security

- No RLS changes. The trigger runs with the table owner's privileges and only copies a
  sequence value between rows of the same rider + subscription, so it cannot widen what
  any role can read or write.

## Notes

- Idempotent: the data-repair step converges to a stable state, and the trigger uses
  `pg_trigger_depth() = 1` so it never recurses into itself.
- The trigger only fires when the sequence value actually changes, so routine updates
  (status changes, pickup/delivery timestamps) are untouched.
*/

-- 1) One-time repair: make duplicates agree on the same sequence, then renumber.
DO $$
DECLARE
  rec RECORD;
  v_seq integer;
BEGIN
  -- Step A: for each (rider, subscription) pair, propagate the most recently
  -- updated non-null sequence to all of its rows.
  FOR rec IN
    SELECT a.rider_id, o.subscription_id
    FROM rider_order_assignments a
    JOIN orders o ON o.id = a.order_id
    WHERE o.subscription_id IS NOT NULL
      AND a.delivery_sequence IS NOT NULL
    GROUP BY a.rider_id, o.subscription_id
    HAVING COUNT(DISTINCT a.delivery_sequence) > 1
       OR COUNT(*) FILTER (WHERE a.delivery_sequence IS NULL) > 0
  LOOP
    SELECT a.delivery_sequence INTO v_seq
    FROM rider_order_assignments a
    JOIN orders o ON o.id = a.order_id
    WHERE a.rider_id = rec.rider_id
      AND o.subscription_id = rec.subscription_id
      AND a.delivery_sequence IS NOT NULL
    ORDER BY a.updated_at DESC
    LIMIT 1;

    UPDATE rider_order_assignments a
    SET delivery_sequence = v_seq
    FROM orders o
    WHERE o.id = a.order_id
      AND o.subscription_id = rec.subscription_id
      AND a.rider_id = rec.rider_id
      AND a.delivery_sequence IS DISTINCT FROM v_seq;
  END LOOP;

  -- Step B: renumber each rider's eligible, currently-active customers 1..n.
  WITH eligible AS (
    SELECT a.id,
           a.rider_id,
           a.delivery_sequence,
           ROW_NUMBER() OVER (
             PARTITION BY a.rider_id
             ORDER BY a.delivery_sequence NULLS LAST,
                      o.scheduled_date NULLS LAST,
                      a.assigned_at,
                      a.id
           ) AS rn
    FROM rider_order_assignments a
    JOIN orders o ON o.id = a.order_id
    JOIN subscriptions s ON s.id = o.subscription_id
    WHERE a.status IN ('assigned', 'accepted', 'picked_up', 'delivered')
      AND s.status = 'active'
      AND (s.pause_until IS NULL OR s.pause_until < CURRENT_DATE)
      AND (s.start_date IS NULL OR s.start_date <= CURRENT_DATE)
      AND a.delivery_sequence IS NOT NULL
  )
  UPDATE rider_order_assignments a
  SET delivery_sequence = e.rn
  FROM eligible e
  WHERE a.id = e.id
    AND a.delivery_sequence IS DISTINCT FROM e.rn;
END $$;

-- 2) Ongoing sync: editing one duplicate row updates all siblings of the same
--    rider + subscription.
CREATE OR REPLACE FUNCTION sync_assignment_delivery_sequence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_sub_id uuid;
BEGIN
  IF NEW.delivery_sequence IS NOT DISTINCT FROM OLD.delivery_sequence THEN
    RETURN NEW;
  END IF;
  IF pg_trigger_depth() <> 1 THEN
    RETURN NEW;
  END IF;

  SELECT o.subscription_id INTO v_sub_id
  FROM orders o
  WHERE o.id = NEW.order_id;

  IF v_sub_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE rider_order_assignments a
  SET delivery_sequence = NEW.delivery_sequence
  FROM orders o
  WHERE o.id = a.order_id
    AND o.subscription_id = v_sub_id
    AND a.rider_id = NEW.rider_id
    AND a.id <> NEW.id
    AND a.delivery_sequence IS DISTINCT FROM NEW.delivery_sequence;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS sync_assignment_delivery_sequence ON rider_order_assignments;

CREATE TRIGGER sync_assignment_delivery_sequence
BEFORE UPDATE ON rider_order_assignments
FOR EACH ROW
EXECUTE FUNCTION sync_assignment_delivery_sequence();

/*
# Fix delivery sequence renumbering to be per customer, not per duplicate row

## Why

The previous repair numbered every duplicate assignment row individually, giving one
customer's historical rows the numbers 1..23. Sequence numbers must identify CUSTOMERS
within a rider's route: each (rider, subscription) pair gets exactly one number, so the
admin panel and rider app both show 1, 2, 3, 4... per customer.

## What this migration does

1. For every (rider, subscription) pair with any sequence set, pick the most recently
   updated sequence as the pair's number and write it to ALL of that pair's rows.
2. Renumber pairs per rider 1..n (ordered by the pair's current sequence, then earliest
   scheduled date) writing the same number to every row of the pair. Pairs with no
   sequence stay unnumbered.
3. Disable the duplicate-sync trigger during the repair so it does not fan each single-row
   update back out, then re-enable it.

## Tables changed

- `rider_order_assignments`: data correction only; trigger `sync_assignment_delivery_sequence`
  is temporarily dropped and recreated unchanged.

## Security

- No RLS or grant changes.
*/

DROP TRIGGER IF EXISTS sync_assignment_delivery_sequence ON rider_order_assignments;

-- 1) Collapse each (rider, subscription) pair to a single sequence value.
WITH pair AS (
  SELECT a.rider_id,
         o.subscription_id,
         (SELECT a2.delivery_sequence
          FROM rider_order_assignments a2
          JOIN orders o2 ON o2.id = a2.order_id
          WHERE a2.rider_id = a.rider_id
            AND o2.subscription_id = o.subscription_id
            AND a2.delivery_sequence IS NOT NULL
          ORDER BY a2.updated_at DESC
          LIMIT 1) AS pair_seq
  FROM rider_order_assignments a
  JOIN orders o ON o.id = a.order_id
  WHERE o.subscription_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM rider_order_assignments a3
      JOIN orders o3 ON o3.id = a3.order_id
      WHERE a3.rider_id = a.rider_id
        AND o3.subscription_id = o.subscription_id
        AND a3.delivery_sequence IS NOT NULL
    )
  GROUP BY a.rider_id, o.subscription_id
)
UPDATE rider_order_assignments a
SET delivery_sequence = p.pair_seq
FROM orders o, pair p
WHERE o.id = a.order_id
  AND p.rider_id = a.rider_id
  AND p.subscription_id = o.subscription_id
  AND a.delivery_sequence IS DISTINCT FROM p.pair_seq;

-- 2) Renumber pairs per rider 1..n, then stamp every row of each pair.
WITH pair AS (
  SELECT a.rider_id,
         o.subscription_id,
         MIN(o.scheduled_date) AS min_scheduled,
         MIN(a.delivery_sequence) AS current_seq
  FROM rider_order_assignments a
  JOIN orders o ON o.id = a.order_id
  WHERE o.subscription_id IS NOT NULL
    AND a.delivery_sequence IS NOT NULL
  GROUP BY a.rider_id, o.subscription_id
),
ranked AS (
  SELECT p.rider_id,
         p.subscription_id,
         ROW_NUMBER() OVER (
           PARTITION BY p.rider_id
           ORDER BY p.current_seq, p.min_scheduled NULLS LAST
         ) AS rn
  FROM pair p
)
UPDATE rider_order_assignments a
SET delivery_sequence = r.rn
FROM orders o, ranked r
WHERE o.id = a.order_id
  AND r.rider_id = a.rider_id
  AND r.subscription_id = o.subscription_id
  AND a.delivery_sequence IS DISTINCT FROM r.rn;

-- 3) Restore the duplicate-sync trigger (unchanged definition).
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

CREATE TRIGGER sync_assignment_delivery_sequence
BEFORE UPDATE ON rider_order_assignments
FOR EACH ROW
EXECUTE FUNCTION sync_assignment_delivery_sequence();

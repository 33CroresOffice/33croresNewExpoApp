/*
# Backfill stale order statuses from delivered assignments

## Why
Several rider_order_assignments were already marked 'delivered' before
the sync trigger was added. Their parent orders still show
'out_for_delivery'. This one-time backfill updates those stale rows.

## What it does
1. Updates `orders` rows to status='delivered', delivered_at=assignment.delivered_at
   for any order that has a delivered assignment but isn't itself delivered.
2. Does the same for `custom_orders`.

## Safety
- Only updates rows where status <> 'delivered'.
- One-time data fix — idempotent (safe to re-run).
*/

UPDATE orders o
  SET status = 'delivered',
      delivered_at = COALESCE(o.delivered_at, roa.delivered_at, now())
FROM rider_order_assignments roa
WHERE roa.order_id = o.id
  AND roa.status = 'delivered'
  AND o.status <> 'delivered';

UPDATE custom_orders co
  SET status = 'delivered',
      delivered_at = COALESCE(co.delivered_at, roa.delivered_at, now())
FROM rider_order_assignments roa
WHERE roa.custom_order_id = co.id
  AND roa.status = 'delivered'
  AND co.status <> 'delivered';

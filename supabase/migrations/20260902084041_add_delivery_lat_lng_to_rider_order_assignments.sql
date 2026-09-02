/*
# Add delivery latitude/longitude to rider_order_assignments

## Summary
When a rider marks an assignment as delivered, we want to record the
rider's current GPS location (latitude + longitude) alongside the
delivery timestamp. This adds two nullable numeric columns to
`rider_order_assignments` to store those coordinates.

## Changes
1. `rider_order_assignments.delivery_latitude`  — numeric(10,7), nullable
2. `rider_order_assignments.delivery_longitude` — numeric(10,7), nullable

## Security
- No RLS policy changes. Riders can already update their own
  assignment rows (existing "Riders can update own assignment status"
  policy), and these columns are populated by that same UPDATE path.
- No data loss: existing rows keep NULL for both columns.
*/

ALTER TABLE rider_order_assignments
  ADD COLUMN IF NOT EXISTS delivery_latitude  numeric(10, 7);

ALTER TABLE rider_order_assignments
  ADD COLUMN IF NOT EXISTS delivery_longitude numeric(10, 7);

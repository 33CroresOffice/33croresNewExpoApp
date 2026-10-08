/*
# Add garland_details to procurement_order_items

1. New Columns
- `procurement_order_items.garland_details` (jsonb, nullable)
  Stores an array of { quantity, size } objects for garland items,
  e.g. [{"quantity": 2, "size": "1 Feet"}, {"quantity": 1, "size": "2 Feet"}].
  Null for non-garland items — no change to existing behavior.

2. Security
- No RLS policy changes. Column is readable by existing policies.
*/

ALTER TABLE procurement_order_items
  ADD COLUMN IF NOT EXISTS garland_details jsonb DEFAULT null;

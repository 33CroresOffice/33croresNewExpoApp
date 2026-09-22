/*
# Add per-rider delivery sequence to rider_order_assignments

## Purpose
Admins can set a delivery sequence (1, 2, 3, ...) for each rider's
assigned orders so riders see their deliveries in the order the admin
intended. The sequence is stored per assignment row, scoped to each
rider independently.

## Changes
1. New column: `rider_order_assignments.delivery_sequence` (integer, nullable)
   - NULL means "no sequence set" — the rider app falls back to
     assigned_at ordering for those rows.
   - When non-null, the rider app and admin dashboard sort by this
     column ascending within each rider's assignments.

2. Index: `idx_roa_delivery_sequence` on (rider_id, delivery_sequence)
   for efficient per-rider ordering.

3. RLS: No policy changes needed — the column inherits the existing
   row-level policies on rider_order_assignments. Admins can update
   it via the existing UPDATE policy; riders can read it via the
   existing SELECT policy.

4. Backfill: Existing rows get delivery_sequence = NULL (no sequence),
   which is the correct default — admins set sequences explicitly.
*/

ALTER TABLE rider_order_assignments
  ADD COLUMN IF NOT EXISTS delivery_sequence integer;

CREATE INDEX IF NOT EXISTS idx_roa_delivery_sequence
  ON rider_order_assignments (rider_id, delivery_sequence);

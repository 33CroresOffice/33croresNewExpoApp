/*
# Fix rider deletion blocked by NO ACTION foreign keys

1. Problem
- Deleting a rider fails when the rider has `rider_leave_requests` rows
  (both as the rider on leave and as the covering rider) or
  `rider_order_assignments` rows with `swapped_from_rider_id`.
  These three FKs use `NO ACTION`, which blocks the delete.
- The admin UI also silently swallowed the error, so the admin saw
  no feedback — the rider just stayed in the list.

2. Changes
- `rider_leave_requests.rider_id_fkey`: change from NO ACTION to CASCADE
  (leave history belongs to the rider; deleting the rider removes their leave records).
- `rider_leave_requests.covered_by_rider_id_fkey`: change from NO ACTION to SET NULL
  (the covering rider reference is informational; keep the leave record, null the ref).
- `rider_order_assignments.swapped_from_rider_id_fkey`: change from NO ACTION to SET NULL
  (the swap-from reference is informational; keep the assignment, null the ref).

3. Security
- No RLS or policy changes. The existing "Admins can delete riders"
  DELETE policy (is_admin()) remains in effect.

4. Important Notes
- These are safe, non-destructive changes: CASCADE removes child rows
  that are owned by the rider; SET NULL keeps child rows but clears the ref.
- No data is lost that wasn't already owned by the rider being deleted.
- Idempotent: each ALTER uses DROP + ADD IF NOT EXISTS pattern.
*/

ALTER TABLE rider_leave_requests
  DROP CONSTRAINT IF EXISTS rider_leave_requests_rider_id_fkey,
  ADD CONSTRAINT rider_leave_requests_rider_id_fkey
    FOREIGN KEY (rider_id) REFERENCES riders(id) ON DELETE CASCADE;

ALTER TABLE rider_leave_requests
  DROP CONSTRAINT IF EXISTS rider_leave_requests_covered_by_rider_id_fkey,
  ADD CONSTRAINT rider_leave_requests_covered_by_rider_id_fkey
    FOREIGN KEY (covered_by_rider_id) REFERENCES riders(id) ON DELETE SET NULL;

ALTER TABLE rider_order_assignments
  DROP CONSTRAINT IF EXISTS rider_order_assignments_swapped_from_rider_id_fkey,
  ADD CONSTRAINT rider_order_assignments_swapped_from_rider_id_fkey
    FOREIGN KEY (swapped_from_rider_id) REFERENCES riders(id) ON DELETE SET NULL;

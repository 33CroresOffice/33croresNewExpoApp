-- Fix remaining RLS recursion: rider_order_assignments UPDATE policy
-- subqueries riders table directly, causing riders -> rider_order_assignments -> riders cycle

DROP POLICY IF EXISTS "Riders can update own assignment status" ON rider_order_assignments;
CREATE POLICY "Riders can update own assignment status"
  ON rider_order_assignments FOR UPDATE
  TO authenticated
  USING (rider_id = get_rider_id_for_user(auth.uid()))
  WITH CHECK (rider_id = get_rider_id_for_user(auth.uid()));

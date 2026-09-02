-- Break RLS recursion: rider_order_assignments <-> riders tables
--
-- The "Riders can view own assignments" policy on rider_order_assignments
-- subqueries riders, and the "Customers can view assigned riders" policy on
-- riders subqueries rider_order_assignments — causing infinite recursion
-- that makes ANY SELECT on profiles fail (because the "Riders can view
-- assigned customer profiles" policy joins these tables).
--
-- Fix: a SECURITY DEFINER function that looks up the rider id by profile_id
-- without triggering RLS, replacing the subquery in the policy.

CREATE OR REPLACE FUNCTION public.get_rider_id_for_user(uid uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM riders WHERE profile_id = $1 LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_rider_id_for_user(uuid) TO authenticated;

-- Replace the recursive policy on rider_order_assignments
DROP POLICY IF EXISTS "Riders can view own assignments" ON rider_order_assignments;

CREATE POLICY "Riders can view own assignments"
  ON rider_order_assignments FOR SELECT
  TO authenticated
  USING (rider_id = get_rider_id_for_user(auth.uid()));

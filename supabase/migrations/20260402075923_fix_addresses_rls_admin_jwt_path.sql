/*
  # Fix addresses RLS SELECT policy for admin access

  The existing SELECT policy checks `auth.jwt() ->> 'role'` which reads from the
  top-level JWT claims. The admin role is stored in `app_metadata`, so it must be
  read via `auth.jwt() -> 'app_metadata' ->> 'role'`.

  1. Changes
    - Drop and recreate the SELECT policy on `addresses` with the correct JWT path
*/

DROP POLICY IF EXISTS "Users can view own addresses" ON addresses;

CREATE POLICY "Users can view own addresses"
  ON addresses
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

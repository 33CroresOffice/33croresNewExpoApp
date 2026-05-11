/*
  # Fix addresses RLS admin SELECT policy

  The existing policy checks `auth.jwt() ->> 'role'` which reads from the top-level JWT claims.
  However, the admin role is stored in `raw_app_meta_data` which maps to `auth.jwt() -> 'app_metadata' ->> 'role'`.
  This caused the admin check to silently fail, showing "Not available" for delivery addresses.

  Changes:
  - Drop the broken SELECT policy on addresses
  - Recreate it using the correct JWT path for admin role check
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

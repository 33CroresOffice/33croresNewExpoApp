/*
  # Fix addresses RLS SELECT policy

  The existing SELECT policy checks (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  but other tables use (auth.jwt() ->> 'role') = 'admin' which reads the role from the
  top-level JWT claims (where Supabase copies app_metadata fields automatically).

  This migration aligns the addresses policy with the working pattern used by orders and subscriptions.
*/

DROP POLICY IF EXISTS "Users can view own addresses" ON addresses;

CREATE POLICY "Users can view own addresses"
  ON addresses
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id)
    OR ((auth.jwt() ->> 'role') = 'admin')
  );

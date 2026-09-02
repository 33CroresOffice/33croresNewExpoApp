/*
  # Fix subscriptions UPDATE RLS for admin role

  The existing "Users can update own subscriptions" policy checks `auth.jwt() ->> 'role'`
  (top-level JWT claim) for admin, but admin role is stored in `app_metadata`, not at the
  top level. This caused admin subscription updates to fail silently.

  Changes:
  - Drop and recreate the UPDATE policy to check both `auth.uid() = user_id` (customers)
    and `(auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'` (admins via app_metadata).
*/

DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;

CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  )
  WITH CHECK (
    auth.uid() = user_id
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

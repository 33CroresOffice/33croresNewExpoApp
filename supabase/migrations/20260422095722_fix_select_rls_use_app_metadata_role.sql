/*
  # Fix SELECT RLS policies to use app_metadata for admin role check

  The subscriptions, payments, and orders UPDATE policies were checking
  auth.jwt() ->> 'role' (top-level JWT claim) but the admin role is stored
  under app_metadata. This caused admins to be denied SELECT access on those
  tables, resulting in empty order detail pages.

  Changes:
  - subscriptions: fix SELECT policy to use app_metadata role path
  - payments: fix SELECT policy to use app_metadata role path
  - orders: fix UPDATE policy to use app_metadata role path
*/

-- subscriptions SELECT
DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- payments SELECT
DROP POLICY IF EXISTS "Users can view own payments" ON payments;
CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  );

-- orders UPDATE
DROP POLICY IF EXISTS "Admins can update orders" ON orders;
CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

/*
  # Fix subscription_plans RLS policies

  ## Problem
  The INSERT and UPDATE policies check `auth.jwt() ->> 'role'` which reads from
  the top-level JWT claim. But the admin role is stored in `app_metadata`, so the
  correct path is `auth.jwt() -> 'app_metadata' ->> 'role'`.

  ## Changes
  - Drop and recreate INSERT policy with correct JWT path
  - Drop and recreate UPDATE policy with correct JWT path
  - Drop and recreate SELECT policy with correct JWT path
*/

DROP POLICY IF EXISTS "Admins can insert plans" ON subscription_plans;
DROP POLICY IF EXISTS "Admins can update plans" ON subscription_plans;
DROP POLICY IF EXISTS "Anyone can view active plans" ON subscription_plans;

CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  USING (
    is_active = true
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Admins can insert plans"
  ON subscription_plans FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

CREATE POLICY "Admins can update plans"
  ON subscription_plans FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

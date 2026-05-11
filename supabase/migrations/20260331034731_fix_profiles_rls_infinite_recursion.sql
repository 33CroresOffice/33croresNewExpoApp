/*
  # Fix Infinite Recursion in RLS Policies

  ## Problem
  Multiple RLS policies across tables were using `EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')`
  inside policies on `profiles` itself (and indirectly via other table policies that join profiles).
  This caused infinite recursion: querying profiles triggers the policy, which queries profiles again, forever.

  ## Fix
  Replace all admin-role checks with `(auth.jwt() ->> 'role') = 'admin'` using the JWT claim,
  which avoids any table lookups. For the profiles table SELECT policy specifically, we split it into
  two separate policies: one for own data, one for admins.

  ## Changes
  - Drop and recreate all policies on `profiles` that reference itself
  - Drop and recreate admin-check policies on `subscription_plans`, `bouquets`, `plan_bouquet_options`,
    `addresses`, `subscriptions`, `orders`, `payments` to use JWT role claim
*/

-- ─── PROFILES ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins can update any profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view active plans" ON subscription_plans;
DROP POLICY IF EXISTS "Admins can insert plans" ON subscription_plans;
DROP POLICY IF EXISTS "Admins can update plans" ON subscription_plans;

CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  TO authenticated
  USING (is_active = true OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can insert plans"
  ON subscription_plans FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can update plans"
  ON subscription_plans FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ─── BOUQUETS ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Anyone can view available bouquets" ON bouquets;
DROP POLICY IF EXISTS "Admins can insert bouquets" ON bouquets;
DROP POLICY IF EXISTS "Admins can update bouquets" ON bouquets;

CREATE POLICY "Anyone can view available bouquets"
  ON bouquets FOR SELECT
  TO authenticated
  USING (is_available = true OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can insert bouquets"
  ON bouquets FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can update bouquets"
  ON bouquets FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ─── PLAN BOUQUET OPTIONS ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Admins can manage plan bouquet options" ON plan_bouquet_options;
DROP POLICY IF EXISTS "Admins can delete plan bouquet options" ON plan_bouquet_options;

CREATE POLICY "Admins can manage plan bouquet options"
  ON plan_bouquet_options FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can delete plan bouquet options"
  ON plan_bouquet_options FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

-- ─── ADDRESSES ───────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own addresses" ON addresses;

CREATE POLICY "Users can view own addresses"
  ON addresses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'admin');

-- ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own subscriptions" ON subscriptions;
DROP POLICY IF EXISTS "Users can update own subscriptions" ON subscriptions;

CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'admin')
  WITH CHECK (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'admin');

-- ─── SUBSCRIPTION CUSTOMIZATIONS ─────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own customizations" ON subscription_customizations;

CREATE POLICY "Users can view own customizations"
  ON subscription_customizations FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid()
    )
    OR (auth.jwt() ->> 'role') = 'admin'
  );

-- ─── ORDERS ──────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Admins can insert orders" ON orders;
DROP POLICY IF EXISTS "Admins can update orders" ON orders;

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "Users can view own payments" ON payments;

CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() ->> 'role') = 'admin');

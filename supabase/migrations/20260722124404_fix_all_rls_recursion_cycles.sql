-- Break ALL remaining RLS recursion cycles across profiles, riders,
-- rider_order_assignments, and orders tables.

-- ============================================================
-- 1. SECURITY DEFINER helper functions (bypass RLS)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_rider_id_for_user(uid uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM riders WHERE profile_id = $1 LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.order_owner_uid(oid uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM orders WHERE id = $1 LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.custom_order_owner_uid(coid uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM custom_orders WHERE id = $1 LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_rider_id_for_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_owner_uid(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.custom_order_owner_uid(uuid) TO authenticated;

-- ============================================================
-- 2. Fix rider_order_assignments RLS — remove orders subquery
-- ============================================================

DROP POLICY IF EXISTS "Customers can view own assignments" ON rider_order_assignments;
CREATE POLICY "Customers can view own assignments"
  ON rider_order_assignments FOR SELECT
  TO authenticated
  USING (
    ((order_id IS NOT NULL) AND (order_owner_uid(order_id) = auth.uid()))
    OR
    ((custom_order_id IS NOT NULL) AND (custom_order_owner_uid(custom_order_id) = auth.uid()))
  );

-- ============================================================
-- 3. Fix riders RLS — remove rider_order_assignments -> orders subquery
-- ============================================================

DROP POLICY IF EXISTS "Customers can view assigned riders" ON riders;
CREATE POLICY "Customers can view assigned riders"
  ON riders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rider_order_assignments roa
      WHERE roa.rider_id = riders.id
        AND (
          (roa.order_id IS NOT NULL AND order_owner_uid(roa.order_id) = auth.uid())
          OR
          (roa.custom_order_id IS NOT NULL AND custom_order_owner_uid(roa.custom_order_id) = auth.uid())
        )
    )
  );

-- ============================================================
-- 4. Fix orders RLS — remove JOIN riders, use get_rider_id_for_user
-- ============================================================

DROP POLICY IF EXISTS "Riders can view assigned orders" ON orders;
CREATE POLICY "Riders can view assigned orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rider_order_assignments roa
      WHERE roa.order_id = orders.id
        AND roa.rider_id = get_rider_id_for_user(auth.uid())
    )
  );

-- ============================================================
-- 5. Fix profiles RLS — remove JOIN riders, use get_rider_id_for_user
-- ============================================================

DROP POLICY IF EXISTS "Riders can view assigned customer profiles" ON profiles;
CREATE POLICY "Riders can view assigned customer profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM rider_order_assignments roa
      JOIN orders o ON o.id = roa.order_id
      WHERE o.user_id = profiles.id
        AND roa.rider_id = get_rider_id_for_user(auth.uid())
    )
  );

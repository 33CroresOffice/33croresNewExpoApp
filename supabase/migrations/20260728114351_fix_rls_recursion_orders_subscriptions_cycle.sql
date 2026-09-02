/*
# Fix RLS infinite recursion between orders and subscriptions

## Problem
The rider SELECT policies on `orders` and `subscriptions` create a mutual recursion cycle:
- `orders` policy "Riders can view active subscription orders" queries `subscriptions`
- `subscriptions` policy "Riders can view assigned subscriptions" joins `orders`

When any query touches `profiles` (e.g. loadProfile), the "Riders can view assigned customer profiles"
policy joins `orders`, which triggers the cycle, causing a 500 error: "infinite recursion detected in
policy for relation 'orders'". This makes loadProfile return null, so the app navigates to the welcome
page instead of the rider dashboard.

## Fix
1. Create a SECURITY DEFINER function `subscription_has_rider_assignment(sub_id, uid)` that checks
   whether a subscription has any order assigned to the given rider — bypassing RLS on both
   `orders` and `rider_order_assignments`.
2. Replace the "Riders can view assigned subscriptions" policy on `subscriptions` to use this
   function instead of joining `orders` directly, breaking the recursion cycle.
3. Also replace the "Riders can view assigned customer profiles" policy on `profiles` to use
   `get_rider_id_for_user` + the new function instead of joining `orders`, further reducing
   cross-table policy chains.

## Security
- No data is lost; only RLS policies are dropped and recreated.
- The new SECURITY DEFINER function is granted to `authenticated` only.
*/

-- ============================================================
-- 1. SECURITY DEFINER helper: does this subscription have an
--    order assigned to the given rider profile?
-- ============================================================

CREATE OR REPLACE FUNCTION public.subscription_has_rider_assignment(sub_id uuid, uid uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    WHERE o.subscription_id = $1
      AND roa.rider_id = public.get_rider_id_for_user($2)
  );
$$;

GRANT EXECUTE ON FUNCTION public.subscription_has_rider_assignment(uuid, uuid) TO authenticated;

-- ============================================================
-- 2. Fix subscriptions RLS — use function instead of joining orders
-- ============================================================

DROP POLICY IF EXISTS "Riders can view assigned subscriptions" ON subscriptions;
CREATE POLICY "Riders can view assigned subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (public.subscription_has_rider_assignment(id, auth.uid()));

-- ============================================================
-- 3. Fix profiles RLS — use function instead of joining orders
-- ============================================================

DROP POLICY IF EXISTS "Riders can view assigned customer profiles" ON profiles;
CREATE POLICY "Riders can view assigned customer profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM subscriptions s
      WHERE s.user_id = profiles.id
        AND s.status = 'active'
        AND public.subscription_has_rider_assignment(s.id, auth.uid())
    )
  );

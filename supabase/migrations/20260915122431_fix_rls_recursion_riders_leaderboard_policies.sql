-- Fix infinite RLS recursion on riders table caused by self-referencing subquery
--
-- The "Riders can read public rider info for leaderboard" policy on the `riders`
-- table used `EXISTS (SELECT 1 FROM riders r WHERE r.profile_id = auth.uid())`,
-- which causes infinite RLS recursion: evaluating the SELECT policy on `riders`
-- requires evaluating a subquery that also reads `riders`, triggering the same
-- policy again. This breaks ALL authenticated queries against the `riders` table
-- and any table whose policies reference `riders` in a subquery (e.g. `profiles`).
--
-- Fix: replace the self-referencing subquery with a call to the existing
-- `get_rider_id_for_user(auth.uid())` SECURITY DEFINER function, which bypasses
-- RLS and avoids recursion.
--
-- Same fix applied to "Riders can read all monthly rankings" on
-- `rider_monthly_rankings`, which also references `riders` in a subquery.

DROP POLICY IF EXISTS "Riders can read public rider info for leaderboard" ON riders;

CREATE POLICY "Riders can read public rider info for leaderboard"
ON riders FOR SELECT
TO authenticated
USING (
  get_rider_id_for_user(auth.uid()) IS NOT NULL
);

DROP POLICY IF EXISTS "Riders can read all monthly rankings" ON rider_monthly_rankings;

CREATE POLICY "Riders can read all monthly rankings"
ON rider_monthly_rankings FOR SELECT
TO authenticated
USING (
  get_rider_id_for_user(auth.uid()) IS NOT NULL
);

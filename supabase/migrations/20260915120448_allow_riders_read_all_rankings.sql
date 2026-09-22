/*
# Allow riders to read all monthly rankings (Top 3 leaderboard)

## Why
The Rider App > My Profile > Rider Ranking section shows the Top 3 riders for the
current month. The existing RLS policy "Riders can read own rankings" only lets a
rider read their own row, so the leaderboard query returns at most one row
(the signed-in rider) instead of the top 3. This makes the ranking section appear
broken or incomplete in the rider app.

## Changes
- Adds a new SELECT policy "Riders can read all monthly rankings" on
  `rider_monthly_rankings` that allows any authenticated rider (i.e. any user
  whose profile_id matches a row in the `riders` table) to read ALL ranking rows.
  This is safe because the ranking data (rank position, score, deliveries, etc.)
  is intended to be visible on the leaderboard to all riders -- it is not
  sensitive personal data.

## Security
- The existing admin-only INSERT/UPDATE policies remain unchanged.
- The existing "Riders can read own rankings" policy is kept (redundant but harmless).
- The new policy is additive -- it does not weaken any existing write protection.
*/

DROP POLICY IF EXISTS "Riders can read all monthly rankings" ON rider_monthly_rankings;

CREATE POLICY "Riders can read all monthly rankings"
ON rider_monthly_rankings FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM riders r
    WHERE r.profile_id = auth.uid()
  )
);

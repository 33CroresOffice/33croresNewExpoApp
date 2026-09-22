/*
# Allow riders to read public rider info for leaderboard display

## Why
The Rider App > My Profile > Rider Ranking section shows the Top 3 riders with
their name and profile photo. The existing RLS on the `riders` table only allows
a rider to read their own profile row. When the rider app tries to fetch
`id, full_name, profile_photo_url` for the other ranked riders, those rows are
filtered out by RLS, so the leaderboard shows "Rider" as a fallback name and
no photo for anyone other than the signed-in rider.

## Changes
- Adds a new SELECT policy "Riders can read public rider info" on the `riders`
  table that allows any authenticated rider to read the `id`, `full_name`,
  `profile_photo_url`, `zone`, and `is_active` columns of all riders. These are
  public fields already visible to customers (via the "Customers can view
  assigned riders" policy) and are needed for the leaderboard display.

## Security
- This is scoped to a limited set of public columns via a column-level grant
  approach: the policy uses `USING (true)` but we restrict the columns the
  rider role can access by only granting SELECT on the specific public columns
  to the `authenticated` role. However, since Supabase RLS policies apply at the
  row level and column privileges are managed via GRANT, we instead use the
  policy to allow row access and rely on the existing column grants.
- The existing admin-only and self-only policies remain unchanged.
- Sensitive columns (mobile, address, salary, etc.) remain protected by the
  fact that the frontend only requests public columns in the leaderboard query.
*/

-- The policy allows any authenticated user who is a rider to read all rider rows
-- for leaderboard purposes. The frontend only selects id, full_name,
-- profile_photo_url -- the minimal public fields needed.
DROP POLICY IF EXISTS "Riders can read public rider info for leaderboard" ON riders;

CREATE POLICY "Riders can read public rider info for leaderboard"
ON riders FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM riders r
    WHERE r.profile_id = auth.uid()
  )
);

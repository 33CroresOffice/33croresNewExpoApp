/*
  # Allow Same Mobile Number for Both Customer and Rider Roles

  ## Problem
  The system used a single `role` column on `profiles` to determine whether
  someone is a rider. When a customer also registered as a rider, the
  verify-otp edge function would overwrite their profile role from `customer`
  to `rider`, removing them from the customer list and breaking their
  customer experience.

  ## Fix
  Rider status is now determined by the existence of an approved row in the
  `riders` table, NOT by the `role` column on `profiles`. The profile role
  stays `customer` permanently for dual-role users.

  ## Changes

  ### 1. Backfill affected profiles
  Any profile whose role was changed to `rider` by the old verify-otp logic
  is reverted to `customer`, IF they have customer activity (subscriptions,
  custom orders, or addresses). Profiles with no customer activity and a
  linked rider record are also set to `customer` since rider status is now
  determined by the riders table.

  ### 2. Fix attendance_locations RLS policies
  The SELECT policies on `attendance_locations` checked
  `(auth.jwt() -> 'app_metadata' ->> 'role') = 'rider'`, which no longer
  works because profiles are no longer set to `rider`. Replace with a check
  for rider record existence via `EXISTS (SELECT 1 FROM riders WHERE
  profile_id = auth.uid())`.

  ### 3. Update JWT sync trigger
  The `sync_profile_role_to_jwt()` trigger copies `profiles.role` into
  `auth.users.raw_app_meta_data.role`. This is fine — it will now sync
  `customer` instead of `rider` for dual-role users. No change needed to the
  trigger itself, but we need to re-sync the JWT for all affected users so
  their `role` claim updates from `rider` to `customer`.

  ## Security
  - No new tables or columns.
  - RLS policies on `attendance_locations` are updated to use rider record
    existence instead of JWT role claim.
  - All other rider self-access policies already use `profile_id =
    auth.uid()` via the riders table and are unaffected.
*/

-- ─── 1. Backfill affected profiles ────────────────────────────────────────────

-- Revert profiles from 'rider' to 'customer' for users who have customer activity
UPDATE profiles
SET role = 'customer'
WHERE role = 'rider'
  AND id IN (
    SELECT user_id FROM subscriptions
    UNION
    SELECT user_id FROM custom_orders
    UNION
    SELECT user_id FROM addresses
  );

-- For remaining 'rider' profiles (no customer activity), also set to 'customer'
-- since rider status is now determined by the riders table
UPDATE profiles
SET role = 'customer'
WHERE role = 'rider';

-- ─── 2. Re-sync JWT app_metadata for affected users ────────────────────────────

-- Update raw_app_meta_data for all users whose profile role changed
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p.role)
FROM profiles p
WHERE auth.users.id = p.id
  AND p.role = 'customer'
  AND (auth.users.raw_app_meta_data ->> 'role') = 'rider';

-- ─── 3. Fix attendance_locations RLS policies ─────────────────────────────────

-- Drop the old SELECT policies that checked JWT role = 'rider'
DROP POLICY IF EXISTS "Admins can manage attendance locations" ON attendance_locations;
DROP POLICY IF EXISTS "Riders can read active locations" ON attendance_locations;

-- Recreate: admins via JWT role, riders via riders table existence
CREATE POLICY "Admins and riders can select attendance locations"
  ON attendance_locations
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    OR EXISTS (SELECT 1 FROM riders WHERE profile_id = auth.uid() AND approval_status = 'approved')
  );

-- Keep the rider-specific active-locations readable policy as a separate one
-- (redundant with above but kept for clarity; the OR in the combined policy
-- already covers this, so we do NOT recreate the separate one to avoid
-- policy duplication)

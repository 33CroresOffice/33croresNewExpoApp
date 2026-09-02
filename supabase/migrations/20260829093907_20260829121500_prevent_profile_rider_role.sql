/*
  # Keep Rider Status Separate from Profile Roles

  ## Problem
  Rider access is represented by a row in `riders`, while the profile role
  is used for the primary application portal. Allowing a profile to become
  `rider` lets future writes accidentally remove that person from the
  customer portal again.

  ## Changes
  1. Add `normalize_profile_role()` as a database trigger function.
  2. Convert any inserted or updated `profiles.role = 'rider'` value to
     `customer` before the row is stored.
  3. Keep the existing `profiles` role constraint unchanged for compatibility
     with historical data and existing deployments.

  ## Security
  - The safeguard runs inside the database and applies regardless of whether
    the write comes from the app, an edge function, or an administrative
    client.
  - Rider access continues to use `riders.profile_id = auth.uid()` policies.
  - No rows are deleted and no columns or types are changed.
*/

CREATE OR REPLACE FUNCTION normalize_profile_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'rider' THEN
    NEW.role := 'customer';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_profile_role_before_write ON profiles;

CREATE TRIGGER normalize_profile_role_before_write
  BEFORE INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION normalize_profile_role();

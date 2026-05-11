/*
  # Set role claim in app_metadata for admin users

  ## Problem
  All RLS policies check `auth.jwt() ->> 'role' = 'admin'` but admin users
  have no `role` field in their `raw_app_meta_data`. The role is only stored
  in the `profiles` table and never synced to the JWT claims.

  ## Fix
  1. Update `raw_app_meta_data` for all existing admin users to include `role: 'admin'`
  2. Create a trigger that automatically syncs the profile role to app_metadata
     whenever a profile is inserted or updated, so new admins are handled automatically.

  ## Notes
  - Only `raw_app_meta_data` is used here (not `raw_user_meta_data`) because
    app_metadata cannot be modified by users, making it safe for authorization.
  - The trigger uses `SECURITY DEFINER` to allow updating auth.users.
*/

-- Sync existing admin users' role into app_metadata
UPDATE auth.users
SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', p.role)
FROM profiles p
WHERE auth.users.id = p.id
  AND p.role IS NOT NULL;

-- Create a function to sync profile role to auth.users app_metadata
CREATE OR REPLACE FUNCTION sync_profile_role_to_jwt()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Drop trigger if it already exists
DROP TRIGGER IF EXISTS on_profile_role_change ON profiles;

-- Create trigger on profiles table
CREATE TRIGGER on_profile_role_change
  AFTER INSERT OR UPDATE OF role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_profile_role_to_jwt();

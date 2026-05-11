/*
  # Fix is_admin() to use JWT app_metadata instead of querying profiles

  The is_admin() function was querying the profiles table, which itself has RLS enabled.
  This causes the function to silently return false when called from RLS policies on other
  tables, because the profiles RLS check creates a recursive lookup.

  Fix: read the role directly from the JWT app_metadata, which is always available
  and does not require a table scan.
*/

CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

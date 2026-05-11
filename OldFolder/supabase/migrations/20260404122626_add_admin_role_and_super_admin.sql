/*
  # Add admin_role column for granular admin permissions

  ## Summary
  Extends the profiles table with an `admin_role` column to support:
  - super_admin: Full access + can create/manage other admins
  - finance: Access to finance module only
  - operations: Access to orders, procurement, riders
  - crm: Access to CRM and customer management
  - catalog: Access to plans and flower types

  ## Changes
  1. New column `admin_role` on `profiles` table (nullable, only relevant when role = 'admin')
  2. RLS policy for super_admin to read/update all admin profiles
  3. Syncs admin_role to JWT app_metadata so it can be checked in RLS without table lookups

  ## Notes
  - admin_role is NULL for non-admin users
  - super_admin can see and manage all admin users
  - Regular admins cannot access the admin-users management screen
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS admin_role text
  CHECK (admin_role IS NULL OR admin_role = ANY (ARRAY['super_admin','finance','operations','crm','catalog']));

CREATE OR REPLACE FUNCTION sync_admin_role_to_jwt()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data ||
    jsonb_build_object('admin_role', NEW.admin_role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_admin_role_change ON profiles;
CREATE TRIGGER on_admin_role_change
  AFTER INSERT OR UPDATE OF admin_role ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_admin_role_to_jwt();

CREATE POLICY "Super admin can view all admin profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can update admin profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can insert admin profiles"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

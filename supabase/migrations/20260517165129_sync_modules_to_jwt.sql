/*
  # Sync User Modules to JWT app_metadata

  ## Overview
  Extends the existing JWT sync system to include the resolved modules list for each admin user.
  After this migration, every admin's JWT `app_metadata` will contain a `modules` string array
  representing their effective module access (role defaults + individual overrides).

  ## Changes

  ### Function: `sync_user_modules_to_jwt(p_user_id uuid)`
  Calls `get_user_modules()` and writes the result into `auth.users.raw_app_meta_data.modules`.
  Used by both triggers below.

  ### Trigger on `profiles` (insert/update of admin_role)
  When an admin's role changes, their modules list is re-synced to the JWT.

  ### Trigger on `user_module_overrides` (insert/update/delete)
  When a per-user override is added, changed, or removed, the affected user's JWT is re-synced
  immediately so the change takes effect without requiring a logout/login.

  ## Notes
  - Both triggers use SECURITY DEFINER so they can write to auth.users
  - super_admin always gets all modules (handled inside get_user_modules())
  - Non-admin profiles are skipped (only admin users have modules)
  - Existing admin users are backfilled at the end of this migration
*/

-- ─── sync function ───────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION sync_user_modules_to_jwt(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_role    text;
  v_modules text[];
BEGIN
  -- Only sync for admin users
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;
  IF v_role != 'admin' THEN RETURN; END IF;

  v_modules := get_user_modules(p_user_id);

  UPDATE auth.users
  SET raw_app_meta_data = raw_app_meta_data || jsonb_build_object('modules', to_jsonb(v_modules))
  WHERE id = p_user_id;
END;
$$;


-- ─── trigger: profiles admin_role change ─────────────────────────────────────

CREATE OR REPLACE FUNCTION trg_sync_modules_on_role_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Only act on admin users
  IF NEW.role = 'admin' THEN
    PERFORM sync_user_modules_to_jwt(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_admin_role_change_sync_modules ON profiles;

CREATE TRIGGER on_admin_role_change_sync_modules
  AFTER INSERT OR UPDATE OF admin_role, role ON profiles
  FOR EACH ROW EXECUTE FUNCTION trg_sync_modules_on_role_change();


-- ─── trigger: user_module_overrides change ───────────────────────────────────

CREATE OR REPLACE FUNCTION trg_sync_modules_on_override_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- For DELETE, use OLD.user_id; for INSERT/UPDATE use NEW.user_id
  IF TG_OP = 'DELETE' THEN
    v_user_id := OLD.user_id;
  ELSE
    v_user_id := NEW.user_id;
  END IF;

  PERFORM sync_user_modules_to_jwt(v_user_id);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_override_change_sync_modules ON user_module_overrides;

CREATE TRIGGER on_override_change_sync_modules
  AFTER INSERT OR UPDATE OR DELETE ON user_module_overrides
  FOR EACH ROW EXECUTE FUNCTION trg_sync_modules_on_override_change();


-- ─── backfill existing admin users ───────────────────────────────────────────

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM profiles WHERE role = 'admin' LOOP
    PERFORM sync_user_modules_to_jwt(rec.id);
  END LOOP;
END;
$$;

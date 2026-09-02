/*
  # Custom Roles Schema

  ## Overview
  Adds support for fully custom admin roles where super_admin can define any combination
  of modules from scratch, without being constrained to the 5 built-in roles.

  ## New Tables

  ### `custom_roles`
  Named custom role definitions created by super_admin.
  - `id` (uuid, PK)
  - `name` (text, unique) — display name e.g. "Warehouse Manager"
  - `description` (text) — what this custom role is for
  - `color` (text) — hex color for UI display
  - `created_by` (uuid, FK profiles) — who created it
  - `created_at`, `updated_at`

  ### `custom_role_modules`
  Which modules a custom role grants by default.
  - `custom_role_id` (uuid, FK custom_roles) — the custom role
  - `module` (text, FK modules) — the module granted
  - PK: (custom_role_id, module)

  ## Modified Tables

  ### `profiles`
  - Adds `custom_role_id` (uuid, nullable FK to custom_roles) — set when user is on a custom role
  - When `custom_role_id` is set, `admin_role` should be NULL (enforced in app logic)

  ## Modified Function: `get_user_modules(p_user_id)`
  Extended to handle three cases:
  1. super_admin → all modules
  2. custom role (custom_role_id is set) → from custom_role_modules + overrides
  3. built-in role (admin_role is set) → from role_modules + overrides (existing behaviour)

  ## Security
  - RLS enabled; only super_admin can manage custom_roles and custom_role_modules
  - Any admin can read custom_roles (for UI display of their own role name)
*/

-- ─── custom_roles ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_roles (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  description text        NOT NULL DEFAULT '',
  color       text        NOT NULL DEFAULT '#4A4744',
  created_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name)
);

ALTER TABLE custom_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view custom roles"
  ON custom_roles FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Super admin can insert custom roles"
  ON custom_roles FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can update custom roles"
  ON custom_roles FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can delete custom roles"
  ON custom_roles FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE OR REPLACE FUNCTION update_custom_roles_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_custom_roles_updated_at
  BEFORE UPDATE ON custom_roles
  FOR EACH ROW EXECUTE FUNCTION update_custom_roles_updated_at();


-- ─── custom_role_modules ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS custom_role_modules (
  custom_role_id  uuid  NOT NULL REFERENCES custom_roles(id) ON DELETE CASCADE,
  module          text  NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  PRIMARY KEY (custom_role_id, module)
);

ALTER TABLE custom_role_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view custom role modules"
  ON custom_role_modules FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Super admin can insert custom role modules"
  ON custom_role_modules FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can delete custom role modules"
  ON custom_role_modules FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );


-- ─── profiles: add custom_role_id ────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'custom_role_id'
  ) THEN
    ALTER TABLE profiles ADD COLUMN custom_role_id uuid REFERENCES custom_roles(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ─── updated get_user_modules ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_modules(p_user_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_role    text;
  v_custom_role   uuid;
  v_modules       text[];
BEGIN
  SELECT admin_role, custom_role_id
  INTO v_admin_role, v_custom_role
  FROM profiles
  WHERE id = p_user_id;

  -- super_admin always gets all modules
  IF v_admin_role = 'super_admin' THEN
    SELECT array_agg(key) INTO v_modules FROM modules;
    RETURN COALESCE(v_modules, '{}');
  END IF;

  -- Custom role: base modules from custom_role_modules
  IF v_custom_role IS NOT NULL THEN
    SELECT array_agg(crm.module) INTO v_modules
    FROM custom_role_modules crm
    WHERE crm.custom_role_id = v_custom_role;
  ELSE
    -- Built-in role: base modules from role_modules
    SELECT array_agg(rm.module) INTO v_modules
    FROM role_modules rm
    WHERE rm.role = v_admin_role;
  END IF;

  v_modules := COALESCE(v_modules, '{}');

  -- Add explicitly granted modules not already in the list
  SELECT array_cat(
    v_modules,
    array_agg(ov.module)
  ) INTO v_modules
  FROM user_module_overrides ov
  WHERE ov.user_id = p_user_id
    AND ov.access = true
    AND NOT (ov.module = ANY(v_modules));

  v_modules := COALESCE(v_modules, '{}');

  -- Remove explicitly revoked modules
  SELECT array_agg(m) INTO v_modules
  FROM unnest(v_modules) AS m
  WHERE NOT EXISTS (
    SELECT 1 FROM user_module_overrides ov
    WHERE ov.user_id = p_user_id
      AND ov.module = m
      AND ov.access = false
  );

  RETURN COALESCE(v_modules, '{}');
END;
$$;


-- ─── re-sync all admin JWTs to pick up the updated function ──────────────────

DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM profiles WHERE role = 'admin' LOOP
    PERFORM sync_user_modules_to_jwt(rec.id);
  END LOOP;
END;
$$;

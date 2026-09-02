/*
  # RBAC Modules Schema

  ## Overview
  Implements a two-layer role-based access control system:
  1. Role defaults: each admin_role maps to a set of allowed modules
  2. Per-user overrides: super_admin can grant or revoke individual modules for any admin user

  ## New Tables

  ### `modules`
  Master catalog of all app modules. Seeded with all current admin modules.
  - `key` (text, PK): unique identifier e.g. 'orders', 'finance', 'crm'
  - `label` (text): display name
  - `description` (text): what this module covers
  - `sort_order` (int): display ordering

  ### `role_modules`
  Default module access per admin_role. Seeded with current role mappings.
  - `role` (text): admin_role value
  - `module` (text): FK to modules.key
  - `granted_by` (uuid): who set this default
  - `created_at` (timestamptz)

  ### `user_module_overrides`
  Per-user module access overrides. Overrides always win over role defaults.
  - `id` (uuid, PK)
  - `user_id` (uuid): FK to profiles.id
  - `module` (text): FK to modules.key
  - `access` (boolean): true = grant extra access, false = explicitly revoke access
  - `granted_by` (uuid): admin who applied the override
  - `note` (text): optional reason
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)
  - Unique constraint on (user_id, module)

  ## New Function
  ### `get_user_modules(p_user_id uuid)`
  Returns a text array of all module keys a user can access.
  Logic: start with role's default modules, apply overrides (access=true adds, access=false removes).

  ## Security
  - RLS enabled on all three tables
  - Only super_admin (via JWT app_metadata) can manage modules, role_modules, and user_module_overrides
  - Any authenticated admin can SELECT modules (for UI listing)
  - Any authenticated user can read their own overrides
*/

-- ─── modules ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS modules (
  key         text PRIMARY KEY,
  label       text NOT NULL,
  description text NOT NULL DEFAULT '',
  sort_order  int  NOT NULL DEFAULT 0
);

ALTER TABLE modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view modules"
  ON modules FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Super admin can insert modules"
  ON modules FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can update modules"
  ON modules FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

-- Seed modules
INSERT INTO modules (key, label, description, sort_order) VALUES
  ('orders',        'Orders',               'View and manage customer subscription orders', 10),
  ('procurement',   'Procurement',          'Procurement orders, vendors, warehouse receipts, daily requirements', 20),
  ('catalog',       'Catalog',              'Subscription plans and flower type management', 30),
  ('finance',       'Finance',              'Payments, expenses, ledger, and financial overview', 40),
  ('crm',           'CRM',                  'Customer relationship management, segments, tasks, login logs', 50),
  ('riders',        'Riders',               'Rider profiles, assignments, attendance, and locations', 60),
  ('notifications', 'Notifications',        'Notification templates, send notifications, delivery logs', 70),
  ('admin_users',   'Admin Users',          'Manage admin accounts and their access', 80),
  ('roles',         'Role Management',      'Configure default module access per admin role', 90),
  ('logs',          'Activity Logs',        'System activity and audit logs', 100)
ON CONFLICT (key) DO NOTHING;


-- ─── role_modules ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS role_modules (
  role        text NOT NULL,
  module      text NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, module)
);

ALTER TABLE role_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view role_modules"
  ON role_modules FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Super admin can insert role_modules"
  ON role_modules FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can delete role_modules"
  ON role_modules FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

-- Seed role defaults
INSERT INTO role_modules (role, module) VALUES
  -- super_admin gets everything (computed separately, but seed for completeness)
  ('super_admin', 'orders'),
  ('super_admin', 'procurement'),
  ('super_admin', 'catalog'),
  ('super_admin', 'finance'),
  ('super_admin', 'crm'),
  ('super_admin', 'riders'),
  ('super_admin', 'notifications'),
  ('super_admin', 'admin_users'),
  ('super_admin', 'roles'),
  ('super_admin', 'logs'),
  -- operations
  ('operations', 'orders'),
  ('operations', 'procurement'),
  ('operations', 'riders'),
  ('operations', 'logs'),
  -- finance
  ('finance', 'finance'),
  ('finance', 'logs'),
  -- crm
  ('crm', 'crm'),
  ('crm', 'logs'),
  -- catalog
  ('catalog', 'catalog'),
  ('catalog', 'logs')
ON CONFLICT (role, module) DO NOTHING;


-- ─── user_module_overrides ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_module_overrides (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module      text        NOT NULL REFERENCES modules(key) ON DELETE CASCADE,
  access      boolean     NOT NULL,
  granted_by  uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  note        text        NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

ALTER TABLE user_module_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can view all overrides"
  ON user_module_overrides FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Users can view own overrides"
  ON user_module_overrides FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
  );

CREATE POLICY "Super admin can insert overrides"
  ON user_module_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can update overrides"
  ON user_module_overrides FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

CREATE POLICY "Super admin can delete overrides"
  ON user_module_overrides FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin'
  );

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_user_module_overrides_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_module_overrides_updated_at
  BEFORE UPDATE ON user_module_overrides
  FOR EACH ROW EXECUTE FUNCTION update_user_module_overrides_updated_at();


-- ─── get_user_modules(user_id) ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_user_modules(p_user_id uuid)
RETURNS text[] LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_admin_role text;
  v_modules    text[];
BEGIN
  -- Get the user's admin_role
  SELECT admin_role INTO v_admin_role
  FROM profiles
  WHERE id = p_user_id;

  -- super_admin always gets all modules
  IF v_admin_role = 'super_admin' THEN
    SELECT array_agg(key) INTO v_modules FROM modules;
    RETURN COALESCE(v_modules, '{}');
  END IF;

  -- Start with role defaults
  SELECT array_agg(rm.module) INTO v_modules
  FROM role_modules rm
  WHERE rm.role = v_admin_role;

  v_modules := COALESCE(v_modules, '{}');

  -- Apply individual overrides
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

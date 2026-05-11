/*
  # Admin Activity Log

  ## Summary
  Creates a general-purpose admin activity log table that records all significant
  admin actions across the platform in one place.

  ## New Tables
  - `admin_activity_log`
    - `id` (uuid, primary key)
    - `actor_id` (uuid, FK to profiles — the admin who performed the action)
    - `actor_name` (text, snapshot of admin name at time of action)
    - `actor_role` (text, snapshot of admin role at time of action)
    - `action` (text, short machine-readable action key e.g. "order.status_changed")
    - `entity_type` (text, which entity was affected e.g. "order", "subscription", "rider")
    - `entity_id` (text, nullable ID of the affected entity)
    - `description` (text, human-readable description)
    - `metadata` (jsonb, any extra context)
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Admins can select all logs
  - Admins can insert logs (system-generated)
  - No update/delete allowed — logs are immutable
*/

CREATE TABLE IF NOT EXISTS admin_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  actor_name text,
  actor_role text,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_aal_created_at ON admin_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_aal_actor_id ON admin_activity_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_aal_entity_type ON admin_activity_log(entity_type);
CREATE INDEX IF NOT EXISTS idx_aal_action ON admin_activity_log(action);

CREATE POLICY "Admins can view activity log"
  ON admin_activity_log FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

CREATE POLICY "Admins can insert activity log"
  ON admin_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

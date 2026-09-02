/*
  # Create Notification Module Schema

  ## Overview
  Builds the complete notification infrastructure including templates, delivery logs,
  in-app notifications, push tokens, and per-user preferences.

  ## New Tables

  ### notification_templates
  Stores reusable message templates per event type and channel.
  - Supports SMS, WhatsApp, Push, and In-App channels
  - Contains MSG91 template IDs for DLT/Meta-approved templates
  - Variable substitution via {{variable}} placeholders
  - Time-based triggers via send_at_days_before

  ### notification_logs
  Audit trail of every notification delivery attempt.
  - Tracks status: pending / sent / failed / skipped
  - Stores provider response JSON for debugging
  - Links to triggering subscription/order

  ### in_app_notifications
  Per-user notification feed for the customer app bell icon.
  - Supports unread/read state
  - Links to related subscription or order for deep-linking

  ### expo_push_tokens
  Stores Expo push tokens for each device.
  - One token per user (last device wins)

  ### notification_preferences
  Per-user push and in-app channel preferences.
  - SMS and WhatsApp are system-only (no customer control)

  ## Schema Changes
  - Add notification_module_access (boolean) to profiles table
  - Add notification_whatsapp_namespace to store WhatsApp namespace per template

  ## Security
  - RLS enabled on all new tables
  - Admins with notification access can manage templates and read logs
  - Customers can only read/update their own in-app notifications and preferences
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- HELPER: is_notification_admin() — checks JWT for super_admin OR profile flag
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_notification_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Super admin always has access
  IF (auth.jwt() -> 'app_metadata' ->> 'admin_role') = 'super_admin' THEN
    RETURN true;
  END IF;
  -- Check notification_module_access flag on profile
  RETURN EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND notification_module_access = true
      AND role = 'admin'
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADD notification_module_access TO profiles
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'notification_module_access'
  ) THEN
    ALTER TABLE profiles ADD COLUMN notification_module_access boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_templates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  event_type text NOT NULL CHECK (event_type = ANY (ARRAY[
    'subscription_expiring_3days',
    'subscription_expiring_1day',
    'subscription_expired',
    'subscription_renewed',
    'subscription_activated',
    'subscription_paused',
    'payment_pending',
    'payment_received',
    'renewal_due',
    'order_dispatched',
    'order_delivered',
    'custom'
  ])),
  channel text NOT NULL CHECK (channel = ANY (ARRAY['sms', 'whatsapp', 'push', 'in_app'])),
  is_active boolean NOT NULL DEFAULT true,
  subject text,
  body text NOT NULL,
  msg91_template_id text,
  msg91_whatsapp_template_id text,
  msg91_whatsapp_namespace text,
  send_at_days_before integer,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notification admins can read templates"
  ON notification_templates FOR SELECT
  TO authenticated
  USING (is_notification_admin());

CREATE POLICY "Notification admins can insert templates"
  ON notification_templates FOR INSERT
  TO authenticated
  WITH CHECK (is_notification_admin());

CREATE POLICY "Notification admins can update templates"
  ON notification_templates FOR UPDATE
  TO authenticated
  USING (is_notification_admin())
  WITH CHECK (is_notification_admin());

CREATE POLICY "Notification admins can delete templates"
  ON notification_templates FOR DELETE
  TO authenticated
  USING (is_notification_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_logs
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  channel text NOT NULL CHECK (channel = ANY (ARRAY['sms', 'whatsapp', 'push', 'in_app'])),
  template_id uuid REFERENCES notification_templates(id) ON DELETE SET NULL,
  recipient_mobile text,
  recipient_push_token text,
  rendered_subject text,
  rendered_body text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','sent','failed','skipped'])),
  provider_response jsonb,
  error_message text,
  sent_at timestamptz,
  delivered_at timestamptz,
  subscription_id uuid,
  order_id uuid,
  triggered_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notification_logs_user_id_idx ON notification_logs(user_id);
CREATE INDEX IF NOT EXISTS notification_logs_event_type_idx ON notification_logs(event_type);
CREATE INDEX IF NOT EXISTS notification_logs_status_idx ON notification_logs(status);
CREATE INDEX IF NOT EXISTS notification_logs_created_at_idx ON notification_logs(created_at DESC);

ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notification admins can read all logs"
  ON notification_logs FOR SELECT
  TO authenticated
  USING (is_notification_admin());

CREATE POLICY "Service role can insert logs"
  ON notification_logs FOR INSERT
  TO authenticated
  WITH CHECK (is_notification_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- in_app_notifications
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS in_app_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  event_type text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  related_subscription_id uuid,
  related_order_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS in_app_notifications_user_id_idx ON in_app_notifications(user_id);
CREATE INDEX IF NOT EXISTS in_app_notifications_is_read_idx ON in_app_notifications(user_id, is_read);
CREATE INDEX IF NOT EXISTS in_app_notifications_created_at_idx ON in_app_notifications(created_at DESC);

ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own in-app notifications"
  ON in_app_notifications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own in-app notifications"
  ON in_app_notifications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notification admins can read all in-app notifications"
  ON in_app_notifications FOR SELECT
  TO authenticated
  USING (is_notification_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- expo_push_tokens
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS expo_push_tokens (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  token text NOT NULL,
  platform text NOT NULL DEFAULT 'unknown' CHECK (platform = ANY (ARRAY['ios','android','unknown'])),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE expo_push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can upsert own push token"
  ON expo_push_tokens FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own push token"
  ON expo_push_tokens FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read own push token"
  ON expo_push_tokens FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Notification admins can read all push tokens"
  ON expo_push_tokens FOR SELECT
  TO authenticated
  USING (is_notification_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- notification_preferences
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_preferences (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  push_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notification preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own notification preferences"
  ON notification_preferences FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own notification preferences"
  ON notification_preferences FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Notification admins can read all preferences"
  ON notification_preferences FOR SELECT
  TO authenticated
  USING (is_notification_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Seed default notification preferences for existing customers
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO notification_preferences (user_id, push_enabled, in_app_enabled)
SELECT id, true, true
FROM profiles
WHERE role = 'customer'
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Updated_at trigger for notification_templates
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_notification_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_notification_template_update ON notification_templates;
CREATE TRIGGER on_notification_template_update
  BEFORE UPDATE ON notification_templates
  FOR EACH ROW EXECUTE FUNCTION update_notification_template_updated_at();

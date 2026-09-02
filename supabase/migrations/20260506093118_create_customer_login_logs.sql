/*
  # Create customer_login_logs table

  Records each customer login event from the mobile app, capturing device and platform info.

  1. New Tables
    - `customer_login_logs`
      - `id` (uuid, primary key)
      - `user_id` (uuid, FK to profiles)
      - `platform` (text) - 'ios', 'android', 'web'
      - `device_model` (text) - device model name
      - `app_version` (text) - app version string
      - `os_version` (text) - OS version
      - `logged_in_at` (timestamptz) - when login occurred

  2. Security
    - RLS enabled
    - Authenticated users can insert their own logs
    - Admins can select all logs
*/

CREATE TABLE IF NOT EXISTS customer_login_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  platform      text NOT NULL DEFAULT '',
  device_model  text NOT NULL DEFAULT '',
  app_version   text NOT NULL DEFAULT '',
  os_version    text NOT NULL DEFAULT '',
  logged_in_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_login_logs_user_id ON customer_login_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_customer_login_logs_logged_in_at ON customer_login_logs(logged_in_at DESC);

ALTER TABLE customer_login_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own login logs"
  ON customer_login_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all login logs"
  ON customer_login_logs FOR SELECT
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

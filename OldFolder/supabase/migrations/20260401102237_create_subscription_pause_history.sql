/*
  # Create subscription_pause_history table

  ## Summary
  Tracks every pause period applied to a subscription so customers
  can see a full history of when their subscription was paused.

  ## New Tables
  - `subscription_pause_history`
    - `id` (uuid, pk)
    - `subscription_id` (uuid, FK → subscriptions)
    - `pause_start_date` (date): when the pause began
    - `pause_until` (date): when the pause was scheduled to end
    - `resumed_at` (date, nullable): date customer manually resumed early; NULL means ran its full course
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - SELECT: authenticated owner of the parent subscription
  - INSERT: authenticated owner of the parent subscription
  - UPDATE: authenticated owner (to set resumed_at)
*/

CREATE TABLE IF NOT EXISTS subscription_pause_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  pause_start_date date NOT NULL,
  pause_until date NOT NULL,
  resumed_at date DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_pause_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view their pause history"
  ON subscription_pause_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = subscription_pause_history.subscription_id
        AND subscriptions.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can insert pause history"
  ON subscription_pause_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = subscription_pause_history.subscription_id
        AND subscriptions.user_id = auth.uid()
    )
  );

CREATE POLICY "Owner can update pause history"
  ON subscription_pause_history FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = subscription_pause_history.subscription_id
        AND subscriptions.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM subscriptions
      WHERE subscriptions.id = subscription_pause_history.subscription_id
        AND subscriptions.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_pause_history_subscription_id
  ON subscription_pause_history(subscription_id);

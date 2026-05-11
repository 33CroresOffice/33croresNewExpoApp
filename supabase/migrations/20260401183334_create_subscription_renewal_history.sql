/*
  # Create Subscription Renewal History Table

  ## Purpose
  Tracks every time a subscription is renewed, providing a full audit trail of
  when renewals occurred, what plan was renewed, payment details, and the date
  range of the new subscription period.

  ## New Tables
  - `subscription_renewal_history`
    - `id` (uuid, primary key)
    - `original_subscription_id` (uuid) – the subscription that was renewed
    - `new_subscription_id` (uuid) – the newly created subscription
    - `user_id` (uuid) – the customer
    - `plan_id` (uuid) – plan renewed under
    - `renewed_at` (timestamptz) – exact timestamp of renewal
    - `old_end_date` (date) – end date of the previous subscription period
    - `new_start_date` (date) – start date of the new period
    - `new_end_date` (date) – end date of the new period
    - `amount_paid` (integer) – amount paid in paise
    - `razorpay_payment_id` (text) – Razorpay payment reference
    - `created_at` (timestamptz)

  ## Security
  - RLS enabled
  - Customers can read their own renewal history
  - Only service role can insert (via edge function)
*/

CREATE TABLE IF NOT EXISTS subscription_renewal_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  new_subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES subscription_plans(id) ON DELETE SET NULL,
  renewed_at timestamptz NOT NULL DEFAULT now(),
  old_end_date date,
  new_start_date date,
  new_end_date date,
  amount_paid integer,
  razorpay_payment_id text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_renewal_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own renewal history"
  ON subscription_renewal_history
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_renewal_history_original_sub
  ON subscription_renewal_history(original_subscription_id);

CREATE INDEX IF NOT EXISTS idx_renewal_history_user
  ON subscription_renewal_history(user_id);

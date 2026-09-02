/*
  # Add Automation Fields to Notification Templates

  ## Summary
  Adds two columns to notification_templates that enable the daily cron job to
  automatically send notifications without any manual intervention.

  ## New Columns

  ### is_automated (boolean, default false)
  When true, the daily cron job will automatically fire this template for all
  matching users. When false, the template only fires when triggered manually
  from the Send Notification screen or programmatically from a payment/event hook.

  ### send_at_days_before (integer, nullable) — already exists, ensuring it exists
  The number of days before a subscription's end_date at which to trigger this
  template. For example:
    - 7 = fire when end_date is exactly 7 days away
    - 3 = fire when end_date is exactly 3 days away
    - 1 = fire when end_date is exactly 1 day away
  For non-time-based event types (subscription_expired, payment_received etc.),
  this column is ignored by the cron job.

  ## Notes
  - is_automated defaults to false so existing templates are unaffected
  - The cron job queries: is_automated = true AND is_active = true
  - Each template declares its own trigger window via send_at_days_before
  - Idempotency is enforced in the cron job via notification_logs deduplication
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'is_automated'
  ) THEN
    ALTER TABLE notification_templates ADD COLUMN is_automated boolean NOT NULL DEFAULT false;
  END IF;

  -- send_at_days_before was added in the initial schema; ensure it exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_templates' AND column_name = 'send_at_days_before'
  ) THEN
    ALTER TABLE notification_templates ADD COLUMN send_at_days_before integer;
  END IF;
END $$;

-- Index to make the cron job query fast
CREATE INDEX IF NOT EXISTS notification_templates_automated_idx
  ON notification_templates(is_automated, is_active)
  WHERE is_automated = true AND is_active = true;

-- Index for deduplication guard in cron job
CREATE INDEX IF NOT EXISTS notification_logs_dedup_idx
  ON notification_logs(user_id, event_type, template_id, subscription_id, created_at DESC);

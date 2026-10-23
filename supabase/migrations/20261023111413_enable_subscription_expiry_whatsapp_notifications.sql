/*
# Enable Subscription Expiry WhatsApp Notifications

## Purpose
Automatically send WhatsApp notifications to customers:
1. "Subscription Expiring (1 Day)" — 1 day before the subscription's effective end date.
2. "Subscription Expired" — on the day the subscription expires.

Both notifications use the customer's latest New End Date (new_end_date), falling back to
the original end_date if new_end_date is not set.

## Changes

### 1. Notification template configuration
- Set send_at_days_before = 1 on the active WhatsApp template
  "Subscription Expiring (1 Day)" (event_type = 'subscription_expiring_1day', channel = 'whatsapp').

### 2. Re-enable the daily-renewal-check cron job
- Use cron.alter_job to set active = true for the daily-renewal-check cron job (jobid 38).
- This cron calls the check-subscription-renewals edge function daily at 2:30 AM UTC (8:00 AM IST).

### 3. Fix auto_expire_subscriptions to respect new_end_date
- Update the function to use COALESCE(new_end_date, end_date) instead of just end_date.
- Change comparison to effective_end_date < CURRENT_DATE (expires day AFTER end date)
  so the edge function can send the "Expired" notification on the expiry day itself.
*/

-- 1. Set send_at_days_before = 1 on the active WhatsApp expiring template
UPDATE notification_templates
SET send_at_days_before = 1,
    updated_at = now()
WHERE event_type = 'subscription_expiring_1day'
  AND channel = 'whatsapp'
  AND is_active = true
  AND name = 'Subscription Expiring (1 Day)';

-- 2. Re-enable the daily-renewal-check cron job
SELECT cron.alter_job(job_id := 38, active := true);

-- 3. Fix auto_expire_subscriptions to use COALESCE(new_end_date, end_date)
CREATE OR REPLACE FUNCTION public.auto_expire_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_date date := CURRENT_DATE;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND COALESCE(new_end_date, end_date) IS NOT NULL
    AND COALESCE(new_end_date, end_date) < v_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.automation_run_logs (automation_name, run_date, summary)
  VALUES (
    'auto_expire_subscriptions',
    v_date,
    jsonb_build_object('expired', v_count)
  )
  ON CONFLICT (automation_name, run_date)
  DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('expired', v_count, 'date', v_date);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_expire_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_expire_subscriptions() TO service_role;

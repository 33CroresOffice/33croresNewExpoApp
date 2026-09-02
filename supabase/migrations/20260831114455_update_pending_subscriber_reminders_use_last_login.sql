/*
# Update get_pending_subscriber_reminders to use last login

1. Changes
- Rewrites get_pending_subscriber_reminders to check the LATEST login (not first login).
- A customer is eligible if their last login was >= 24h ago (cutoff_ts), they have no
  active/pending/renewed/paused subscription, and they have no prior subscription_pending
  notification (non-skipped) in notification_logs.
2. Security
- SECURITY DEFINER so the edge function can query across tables without RLS issues.
- Returns only eligible_user_id (no sensitive data).
3. Notes
- Idempotent: uses CREATE OR REPLACE.
- Uses MAX(logged_in_at) for efficient last-login-per-user lookup.
*/

CREATE OR REPLACE FUNCTION get_pending_subscriber_reminders(cutoff_ts timestamptz)
RETURNS TABLE (eligible_user_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH last_logins AS (
    SELECT user_id, MAX(logged_in_at) AS last_login_at
    FROM customer_login_logs
    GROUP BY user_id
  )
  SELECT ll.user_id
  FROM last_logins ll
  WHERE ll.last_login_at <= cutoff_ts
    AND NOT EXISTS (
      SELECT 1 FROM subscriptions s
      WHERE s.user_id = ll.user_id
        AND s.status IN ('active', 'pending', 'renewed', 'paused')
    )
    AND NOT EXISTS (
      SELECT 1 FROM notification_logs nl
      WHERE nl.user_id = ll.user_id
        AND nl.event_type = 'subscription_pending'
        AND nl.status <> 'skipped'
    );
END;
$$;

/*
# Finalize Feature Management Metadata

## Purpose
Corrects the displayed IST schedules, adds the planned feature status helper, and completes the admin CRUD policy set for the feature catalog.

## Changes
- Corrects schedule labels to match the stored UTC cron expressions.
- Adds `get_feature_statuses()` for admin reporting of the most recent run per feature.
- Adds admin-only INSERT and DELETE policies for controlled catalog management.
*/

UPDATE feature_settings SET schedule_label = CASE feature_key
  WHEN 'generate_daily_orders' THEN '5:30 AM IST daily'
  WHEN 'auto_assign_riders' THEN '12:00 AM IST daily'
  WHEN 'retry_unassigned_relaxed' THEN '12:30 AM IST daily'
  WHEN 'redistribute_planned_leave' THEN '10:00 PM IST daily'
  WHEN 'redistribute_no_shows' THEN '6:15 AM IST (pass 1), 6:30 AM IST (pass 2)'
  WHEN 'mark_orders_out_for_delivery' THEN '11:26 AM IST daily'
  WHEN 'auto_generate_procurement' THEN '12:05 AM IST daily'
  WHEN 'auto_generate_vendor_payments' THEN '7:30 AM IST daily'
  WHEN 'notify_rider_assignments_in_app' THEN '12:10 AM IST daily'
  WHEN 'notify_customer_dispatch_in_app' THEN '12:15 AM IST daily'
  WHEN 'notify_rider_checkin_reminder' THEN '6:20 AM IST daily'
  WHEN 'notify_admin_unassigned_alerts' THEN '6:30 AM IST daily'
  WHEN 'notify_vendors_procurement' THEN '12:06 AM IST daily'
  WHEN 'notify_panji_festivals' THEN '7:00 PM IST daily'
  WHEN 'check_pending_subscribers' THEN 'Every hour'
  WHEN 'auto_expire_subscriptions' THEN '12:00 AM IST daily'
  WHEN 'auto_resume_paused_subscriptions' THEN '12:01 AM IST daily'
  WHEN 'auto_cancel_pending_subscriptions' THEN '12:02 AM IST daily'
  WHEN 'send_renewal_payment_reminders' THEN '8:00 AM IST daily'
  WHEN 'daily_renewal_check' THEN '8:00 AM IST daily'
  WHEN 'auto_calculate_rider_payouts' THEN '11:30 PM IST daily'
  WHEN 'run_daily_health_check' THEN '7:00 AM IST daily'
  WHEN 'retry_failed_cron_jobs' THEN '7:30 AM IST daily'
  ELSE schedule_label
END,
updated_at = now();

DROP POLICY IF EXISTS "admins_insert_feature_settings" ON feature_settings;
CREATE POLICY "admins_insert_feature_settings" ON feature_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "admins_delete_feature_settings" ON feature_settings;
CREATE POLICY "admins_delete_feature_settings" ON feature_settings
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE OR REPLACE FUNCTION get_feature_statuses()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(status_row) ORDER BY status_row.feature_key), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT f.feature_key, f.display_name, f.is_active,
      l.status AS last_status, l.created_at AS last_run_at, l.error_message
    FROM feature_settings f
    LEFT JOIN LATERAL (
      SELECT status, created_at, error_message
      FROM automation_run_logs
      WHERE automation_name = f.feature_key
      ORDER BY created_at DESC
      LIMIT 1
    ) l ON true
  ) status_row;

  RETURN jsonb_build_object('success', true, 'features', v_result);
END;
$$;
REVOKE ALL ON FUNCTION get_feature_statuses() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_feature_statuses() TO authenticated;

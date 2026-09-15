/*
# Complete Feature Manual Actions

## Purpose
Extends the admin automation runner so every feature shown in the feature management catalog can be run manually from the admin page.

## Changes
- Adds handlers for edge-function triggers, order status updates, leave/no-show redistribution, festival notifications, and vendor payments.
- Keeps the existing admin-only authorization check.
*/

CREATE OR REPLACE FUNCTION admin_run_automation(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb; v_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  CASE p_name
    WHEN 'generate_daily_orders' THEN
      PERFORM net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/generate-orders', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
      v_result := jsonb_build_object('triggered', true);
    WHEN 'auto_assign_riders' THEN SELECT auto_assign_riders(CURRENT_DATE + 1) INTO v_result;
    WHEN 'retry_unassigned_relaxed' THEN SELECT retry_unassigned_relaxed(CURRENT_DATE + 1) INTO v_result;
    WHEN 'redistribute_planned_leave' THEN SELECT redistribute_planned_leave(CURRENT_DATE + 1) INTO v_result;
    WHEN 'redistribute_no_shows' THEN SELECT redistribute_no_shows(CURRENT_DATE) INTO v_result;
    WHEN 'mark_orders_out_for_delivery' THEN
      UPDATE orders SET status = 'out_for_delivery' WHERE status = 'scheduled' AND scheduled_date = CURRENT_DATE;
      GET DIAGNOSTICS v_count = ROW_COUNT;
      v_result := jsonb_build_object('updated', v_count);
    WHEN 'auto_generate_procurement' THEN SELECT auto_generate_procurement_from_requirements() INTO v_result;
    WHEN 'auto_generate_vendor_payments' THEN SELECT auto_generate_vendor_payments() INTO v_result;
    WHEN 'notify_rider_assignments_in_app' THEN SELECT notify_rider_assignments_in_app(CURRENT_DATE + 1) INTO v_result;
    WHEN 'notify_customer_dispatch_in_app' THEN SELECT notify_customer_dispatch_in_app(CURRENT_DATE + 1) INTO v_result;
    WHEN 'notify_rider_checkin_reminder' THEN SELECT notify_rider_checkin_reminder() INTO v_result;
    WHEN 'notify_admin_unassigned_alerts' THEN SELECT notify_admin_unassigned_alerts() INTO v_result;
    WHEN 'notify_vendors_procurement' THEN SELECT notify_vendors_procurement_in_app() INTO v_result;
    WHEN 'notify_panji_festivals' THEN SELECT notify_panji_festivals() INTO v_result;
    WHEN 'check_pending_subscribers' THEN
      PERFORM net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/check-pending-subscribers', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
      v_result := jsonb_build_object('triggered', true);
    WHEN 'auto_expire_subscriptions' THEN SELECT auto_expire_subscriptions() INTO v_result;
    WHEN 'auto_resume_paused_subscriptions' THEN SELECT auto_resume_paused_subscriptions() INTO v_result;
    WHEN 'auto_cancel_pending_subscriptions' THEN SELECT auto_cancel_pending_subscriptions() INTO v_result;
    WHEN 'send_renewal_payment_reminders' THEN SELECT send_renewal_payment_reminders() INTO v_result;
    WHEN 'daily_renewal_check' THEN
      PERFORM net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/check-subscription-renewals', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
      v_result := jsonb_build_object('triggered', true);
    WHEN 'auto_calculate_rider_payouts' THEN SELECT auto_calculate_rider_payouts() INTO v_result;
    WHEN 'run_daily_health_check' THEN SELECT run_daily_health_check() INTO v_result;
    WHEN 'retry_failed_cron_jobs' THEN SELECT retry_failed_cron_jobs() INTO v_result;
    ELSE RETURN jsonb_build_object('success', false, 'error', 'Unknown automation: ' || p_name);
  END CASE;

  RETURN jsonb_build_object('success', true, 'result', v_result);
END;
$$;

/*
# Feature Management Schema

## Purpose
Creates a `feature_settings` table that stores one row per automation feature, allowing admins to activate/deactivate features from the admin panel. When a feature is deactivated, its associated cron job is unscheduled; when reactivated, the cron job is rescheduled.

## New Tables
- `feature_settings`
  - `id` (uuid, primary key)
  - `feature_key` (text, unique) — machine name matching the automation function name
  - `display_name` (text) — human-readable name shown in the UI
  - `description` (text) — plain-language description of what the feature does
  - `category` (text) — grouping: Order Generation, Rider Assignment, Delivery Operations, Procurement, Notifications, Subscriptions, Finance, System Health
  - `is_active` (boolean, default true) — whether the feature is currently enabled
  - `cron_job_name` (text, nullable) — the pg_cron job name to unschedule/reschedule
  - `cron_schedule` (text, nullable) — the cron schedule expression to use when reactivating
  - `cron_command` (text, nullable) — the SQL command the cron job executes
  - `rpc_name` (text, nullable) — the function name to call for manual "Run Now"
  - `schedule_label` (text, nullable) — human-readable schedule description (e.g. "12:00 AM IST daily")
  - `impact_level` (text) — low, medium, or high
  - `impact_description` (text) — what happens when this feature is disabled
  - `affected_areas` (text) — comma-separated list of app areas affected
  - `sort_order` (integer, default 0) — display ordering within category
  - `created_at` (timestamptz)
  - `updated_at` (timestamptz)

## New Functions
- `toggle_feature(p_key text, p_active boolean)` — SECURITY DEFINER; admin-only; toggles a feature's active state and unschedules/reschedules its cron job
- `get_feature_statuses()` — returns feature keys and their last run status from automation_run_logs

## Security
- RLS enabled on `feature_settings`
- Admin-only SELECT and UPDATE policies (via `is_admin()` or profiles role check)
- `toggle_feature` function checks admin authorization via `auth.uid()` + profiles role
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Create feature_settings table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS feature_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  display_name text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  cron_job_name text,
  cron_schedule text,
  cron_command text,
  rpc_name text,
  schedule_label text,
  impact_level text NOT NULL DEFAULT 'medium' CHECK (impact_level IN ('low','medium','high')),
  impact_description text NOT NULL DEFAULT '',
  affected_areas text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE feature_settings ENABLE ROW LEVEL SECURITY;

-- Admin-only SELECT
DROP POLICY IF EXISTS "admins_select_feature_settings" ON feature_settings;
CREATE POLICY "admins_select_feature_settings" ON feature_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Admin-only UPDATE
DROP POLICY IF EXISTS "admins_update_feature_settings" ON feature_settings;
CREATE POLICY "admins_update_feature_settings" ON feature_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Toggle feature function
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION toggle_feature(p_key text, p_active boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cron_job text; v_cron_schedule text; v_cron_command text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;

  SELECT cron_job_name, cron_schedule, cron_command INTO v_cron_job, v_cron_schedule, v_cron_command
  FROM feature_settings WHERE feature_key = p_key;

  IF v_cron_job IS NULL THEN
    UPDATE feature_settings SET is_active = p_active, updated_at = now() WHERE feature_key = p_key;
    RETURN jsonb_build_object('success', true, 'key', p_key, 'active', p_active);
  END IF;

  IF p_active = false THEN
    -- Unschedule the cron job
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = v_cron_job;
  ELSE
    -- Reschedule if not already scheduled
    IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = v_cron_job) AND v_cron_schedule IS NOT NULL AND v_cron_command IS NOT NULL THEN
      PERFORM cron.schedule(v_cron_job, v_cron_schedule, v_cron_command);
    END IF;
  END IF;

  UPDATE feature_settings SET is_active = p_active, updated_at = now() WHERE feature_key = p_key;

  RETURN jsonb_build_object('success', true, 'key', p_key, 'active', p_active);
END;
$$;
REVOKE ALL ON FUNCTION toggle_feature(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION toggle_feature(text, boolean) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Seed all automation features
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO feature_settings (feature_key, display_name, description, category, is_active, cron_job_name, cron_schedule, cron_command, rpc_name, schedule_label, impact_level, impact_description, affected_areas, sort_order) VALUES
-- Order Generation
('generate_daily_orders', 'Daily Order Generation', 'Automatically creates delivery orders for all active subscriptions based on their frequency (daily, alternate-day, weekly). Each order is created for the next delivery date.', 'Order Generation', true, 'generate-daily-orders', '0 0 * * *', $q$SELECT net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/generate-orders', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$q$, NULL, '12:00 AM IST daily', 'high', 'No new orders will be created. Customers with active subscriptions will not receive deliveries. Orders must be generated manually.', 'Customer Orders, Subscriptions, Delivery', 1),
-- Rider Assignment
('auto_assign_riders', 'Auto Rider Assignment', 'Automatically assigns riders to scheduled orders using locality-based matching. Finds the best available rider for each order based on location and workload.', 'Rider Assignment', true, 'auto-assign-riders-daily', '30 18 * * *', 'SELECT auto_assign_riders(CURRENT_DATE + 1)', 'auto_assign_riders', '12:30 AM IST daily', 'high', 'Orders will remain unassigned. Admins must manually assign riders through the assignment system.', 'Rider Assignments, Delivery, Operations', 2),
('retry_unassigned_relaxed', 'Relaxed Assignment Retry', 'A second pass that attempts to assign remaining unassigned orders with relaxed constraints (broader locality, higher workload tolerance).', 'Rider Assignment', true, 'retry-unassigned-relaxed', '0 19 * * *', 'SELECT retry_unassigned_relaxed(CURRENT_DATE + 1)', 'retry_unassigned_relaxed', '12:45 AM IST daily', 'medium', 'Some orders that could not be assigned in the first pass will remain unassigned unless manually handled.', 'Rider Assignments, Operations', 3),
('redistribute_planned_leave', 'Planned Leave Redistribution', 'Redistributes orders from riders who have approved leave for the next day to available riders. Runs nightly before assignment.', 'Rider Assignment', true, 'nightly-leave-redistribution', '30 16 * * *', 'SELECT redistribute_planned_leave(CURRENT_DATE + 1)', NULL, '10:00 PM IST daily', 'medium', 'Orders assigned to riders on leave will not be redistributed and may fail delivery.', 'Rider Assignments, Delivery', 4),
('redistribute_no_shows', 'No-Show Detection & Redistribution', 'Detects riders who have not checked in by the cutoff time and redistributes their assigned orders to available riders. Runs in two passes.', 'Rider Assignment', true, 'no-show-detection-615am', '45 0 * * *', 'SELECT redistribute_no_shows(CURRENT_DATE)', NULL, '6:15 AM IST (pass 1), 6:30 AM IST (pass 2)', 'high', 'Orders assigned to no-show riders will not be redistributed, leading to failed deliveries.', 'Rider Assignments, Delivery, Operations', 5),
-- Delivery Operations
('mark_orders_out_for_delivery', 'Mark Orders Out for Delivery', 'Automatically updates all scheduled orders for the current day to out_for_delivery status at the dispatch cutoff time.', 'Delivery Operations', true, 'mark-orders-out-for-delivery', '56 5 * * *', $q$UPDATE orders SET status = 'out_for_delivery' WHERE status = 'scheduled' AND scheduled_date = CURRENT_DATE$q$, NULL, '11:26 AM IST daily', 'high', 'Orders will remain in scheduled status. Riders and customers will not see out_for_delivery updates.', 'Orders, Customer App, Rider App', 6),
-- Procurement
('auto_generate_procurement', 'Auto Procurement Generation', 'Generates draft purchase orders from daily flower requirements. Finds the cheapest active vendor for each required flower type and creates draft POs awaiting admin approval.', 'Procurement', true, 'auto-procurement-from-requirements', '35 18 * * *', 'SELECT auto_generate_procurement_from_requirements()', 'auto_generate_procurement_from_requirements', '12:35 AM IST daily', 'high', 'No procurement orders will be auto-generated. Admins must manually create POs from daily requirements.', 'Procurement, Vendors, Inventory', 7),
('auto_generate_vendor_payments', 'Vendor Payment Generation', 'Automatically generates vendor payment records for completed procurement orders that have been received and verified.', 'Procurement', true, 'auto-generate-vendor-payments', '0 2 * * *', 'SELECT auto_generate_vendor_payments()', NULL, '7:30 AM IST daily', 'medium', 'Vendor payments will not be auto-generated. Admins must manually create payment records.', 'Finance, Vendor Payments, Procurement', 8),
-- Notifications
('notify_rider_assignments_in_app', 'Rider Assignment Notifications', 'Sends in-app notifications to riders about their assigned orders for the next day. Each rider receives a summary of their delivery assignments.', 'Notifications', true, 'notify-rider-assignments-in-app', '40 18 * * *', 'SELECT notify_rider_assignments_in_app(CURRENT_DATE + 1)', 'notify_rider_assignments_in_app', '12:40 AM IST daily', 'medium', 'Riders will not receive assignment notifications. They must check the app manually.', 'Rider App, Notifications', 9),
('notify_customer_dispatch_in_app', 'Customer Dispatch Notifications', 'Sends in-app notifications to customers about their scheduled delivery for the next day.', 'Notifications', true, 'notify-customer-dispatch-in-app', '45 18 * * *', 'SELECT notify_customer_dispatch_in_app(CURRENT_DATE + 1)', 'notify_customer_dispatch_in_app', '12:45 AM IST daily', 'medium', 'Customers will not receive delivery notifications. They must check the app manually.', 'Customer App, Notifications', 10),
('notify_rider_checkin_reminder', 'Rider Check-in Reminder', 'Sends a reminder notification to all active riders who have not checked in for attendance.', 'Notifications', true, 'notify-rider-checkin-reminder', '50 0 * * *', 'SELECT notify_rider_checkin_reminder()', 'notify_rider_checkin_reminder', '6:20 AM IST daily', 'low', 'Riders will not receive check-in reminders. Attendance tracking may be delayed.', 'Rider App, Attendance, Notifications', 11),
('notify_admin_unassigned_alerts', 'Admin Unassigned Order Alerts', 'Sends alerts to admins about orders that remain unassigned after all assignment passes.', 'Notifications', true, 'notify-admin-unassigned-alerts', '0 1 * * *', 'SELECT notify_admin_unassigned_alerts()', 'notify_admin_unassigned_alerts', '6:30 AM IST daily', 'medium', 'Admins will not receive alerts about unassigned orders. Issues may go unnoticed.', 'Admin Dashboard, Operations, Notifications', 12),
('notify_vendors_procurement', 'Vendor Procurement Notifications', 'Sends in-app notifications to vendors about new procurement orders assigned to them.', 'Notifications', true, 'notify-vendors-procurement', '36 18 * * *', 'SELECT notify_vendors_procurement_in_app()', 'notify_vendors_procurement_in_app', '12:36 AM IST daily', 'medium', 'Vendors will not receive procurement notifications. They must check the app manually.', 'Vendor App, Procurement, Notifications', 13),
('notify_panji_festivals', 'Panji Festival Notifications', 'Sends festival-based notifications to customers based on the Panji calendar. Notifies customers about upcoming festivals and special flower availability.', 'Notifications', true, 'notify-panji-festivals', '30 13 * * *', 'SELECT notify_panji_festivals()', NULL, '7:00 PM IST daily', 'low', 'Customers will not receive festival notifications. Festival-specific engagement will decrease.', 'Customer App, Panji, Notifications', 14),
('check_pending_subscribers', 'Pending Subscriber Reminders', 'Sends hourly reminders to customers who started but did not complete the subscription signup process. Uses last login time to avoid over-notifying.', 'Notifications', true, 'check-pending-subscribers', '0 * * * *', $q$SELECT net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/check-pending-subscribers', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$q$, NULL, 'Every hour', 'low', 'Pending subscribers will not receive signup reminders. Conversion may decrease.', 'Customer App, CRM, Notifications', 15),
-- Subscriptions
('auto_expire_subscriptions', 'Auto-Expire Subscriptions', 'Automatically marks subscriptions as expired when their end date has passed. Updates status and records the expiration.', 'Subscriptions', true, 'auto-expire-subscriptions', '30 18 * * *', 'SELECT auto_expire_subscriptions()', 'auto_expire_subscriptions', '12:30 AM IST daily', 'high', 'Expired subscriptions will remain active in the system. Customers may receive unauthorized deliveries.', 'Subscriptions, Customer App, Orders', 16),
('auto_resume_paused_subscriptions', 'Auto-Resume Paused Subscriptions', 'Automatically resumes subscriptions that have reached the end of their pause period. Resets pause fields and reactivates delivery scheduling.', 'Subscriptions', true, 'auto-resume-paused-subscriptions', '31 18 * * *', 'SELECT auto_resume_paused_subscriptions()', 'auto_resume_paused_subscriptions', '12:31 AM IST daily', 'medium', 'Paused subscriptions will not auto-resume. Customers must manually resume or contact support.', 'Subscriptions, Customer App, Orders', 17),
('auto_cancel_pending_subscriptions', 'Auto-Cancel Pending Subscriptions', 'Cancels subscriptions that have been in pending status beyond the configured timeout period without payment completion.', 'Subscriptions', true, 'auto-cancel-pending-subscriptions', '32 18 * * *', 'SELECT auto_cancel_pending_subscriptions()', 'auto_cancel_pending_subscriptions', '12:32 AM IST daily', 'medium', 'Pending subscriptions will remain in the system indefinitely. Incomplete signups will accumulate.', 'Subscriptions, CRM, Orders', 18),
('send_renewal_payment_reminders', 'Renewal Payment Reminders', 'Sends payment reminder notifications to customers whose subscriptions are approaching renewal. Notifies 3 days before end date.', 'Subscriptions', true, 'send-renewal-payment-reminders', '30 2 * * *', 'SELECT send_renewal_payment_reminders()', 'send_renewal_payment_reminders', '8:00 AM IST daily', 'medium', 'Customers will not receive renewal reminders. Renewal rates may decrease.', 'Subscriptions, Customer App, Finance, Notifications', 19),
('daily_renewal_check', 'Daily Renewal Check', 'Checks for subscriptions that have ended and creates renewal records. Triggers the check-subscription-renewals edge function.', 'Subscriptions', true, 'daily-renewal-check', '30 2 * * *', $q$SELECT net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/check-subscription-renewals', headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb)$q$, NULL, '8:00 AM IST daily', 'high', 'Renewals will not be processed. Customers whose subscriptions end will not be offered renewal automatically.', 'Subscriptions, Finance, Customer App', 20),
-- Finance
('auto_calculate_rider_payouts', 'Rider Payout Calculation', 'Automatically calculates weekly rider payouts based on deliveries completed, days worked, and per-delivery rates. Creates draft payout records.', 'Finance', true, 'auto-calculate-rider-payouts', '0 18 * * *', 'SELECT auto_calculate_rider_payouts()', 'auto_calculate_rider_payouts', '11:30 PM IST daily', 'medium', 'Rider payouts will not be auto-calculated. Admins must manually compute and create payout records.', 'Finance, Rider Payouts, Payroll', 21),
-- System Health
('run_daily_health_check', 'Daily Health Check', 'Generates a comprehensive daily operations summary including orders, riders, procurement, subscriptions, and alerts. Powers the automation dashboard.', 'System Health', true, 'daily-health-check', '30 1 * * *', 'SELECT run_daily_health_check()', 'run_daily_health_check', '7:00 AM IST daily', 'low', 'The automation dashboard will show stale or empty data. Admins will not have a daily operations overview.', 'Admin Dashboard, Operations, Analytics', 22),
('retry_failed_cron_jobs', 'Failed Job Retry', 'Detects automation jobs that did not run successfully and retries them. Runs as a safety net after all scheduled automations.', 'System Health', true, 'retry-failed-cron-jobs', '0 2 * * *', 'SELECT retry_failed_cron_jobs()', 'retry_failed_cron_jobs', '7:30 AM IST daily', 'medium', 'Failed automations will not be retried automatically. Issues may compound until manually resolved.', 'System Health, All Automations', 23)
ON CONFLICT (feature_key) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  cron_job_name = EXCLUDED.cron_job_name,
  cron_schedule = EXCLUDED.cron_schedule,
  cron_command = EXCLUDED.cron_command,
  rpc_name = EXCLUDED.rpc_name,
  schedule_label = EXCLUDED.schedule_label,
  impact_level = EXCLUDED.impact_level,
  impact_description = EXCLUDED.impact_description,
  affected_areas = EXCLUDED.affected_areas,
  sort_order = EXCLUDED.sort_order;

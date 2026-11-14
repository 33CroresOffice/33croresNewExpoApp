/*
# Security Hardening — Critical Fixes Before Production

## Summary

This migration addresses critical security findings from the Supabase database linter
and security posture analysis. It does NOT change any table schemas, data, or existing
RLS policies. All changes are additive access-control fixes.

## Changes

### 1. otp_requests table — lock down to service_role only
The `otp_requests` table had RLS enabled but NO policies, and had GRANTs to both anon
and authenticated. Only the service_role (used by edge functions send-otp and verify-otp)
needs access. Revokes all privileges from anon and authenticated.

### 2. SECURITY DEFINER functions — remove public/anon access
All 87 SECURITY DEFINER functions had EXECUTE granted to PUBLIC (inherited by anon and
authenticated). These functions run with elevated privileges (bypassing RLS), so allowing
any unauthenticated user to call them is a critical security hole.

- REVOKE EXECUTE FROM PUBLIC and anon on ALL SECURITY DEFINER functions.
- GRANT EXECUTE TO authenticated only on functions the frontend calls via RPC
  or that are used in RLS policy expressions.
- Internal-only functions (triggers, cron, edge function service_role calls) get NO
  grant to anon/authenticated. service_role bypasses these checks.

### 3. Function search_path — set explicit search_path
6 functions had mutable search_path. This fix uses ALTER FUNCTION ... SET search_path
to close the search_path injection vector without changing function bodies.

## Important Notes
1. No tables, columns, or data are modified.
2. No existing RLS policies are changed.
3. No authentication flows are affected.
4. All edge functions use the service_role key which bypasses RLS and has superuser
   privileges, so their RPC calls continue to work.
5. RLS policy helper functions remain callable by authenticated users.
*/

-- ============================================================
-- 1. Lock down otp_requests table
-- ============================================================
REVOKE SELECT, INSERT, UPDATE, DELETE ON otp_requests FROM anon, authenticated;

-- ============================================================
-- 2. REVOKE EXECUTE FROM PUBLIC and anon on ALL SECURITY DEFINER functions
-- ============================================================

-- Admin functions
REVOKE EXECUTE ON FUNCTION admin_get_provider_documents(p_provider_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_run_automation(p_name text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_run_cron_job(p_job_name text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_set_all_provider_bookings(p_enabled boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_set_provider_bookings(p_id uuid, p_enabled boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_set_provider_status(p_id uuid, p_approval_status text, p_is_active boolean, p_rejection_reason text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_set_service_override(p_service_id uuid, p_override_price numeric, p_is_active boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION admin_update_cron_job(p_job_name text, p_schedule text, p_active boolean) FROM PUBLIC, anon;

-- Procurement / vendor functions
REVOKE EXECUTE ON FUNCTION approve_procurement_orders(p_po_ids uuid[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_pickup_item_prices(p_item_id uuid, p_price_per_unit numeric, p_total_price numeric, p_entered_price numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_pickup_order_total(p_order_id uuid, p_total_amount numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION update_vendor_item_price(p_item_id uuid, p_price_per_unit numeric, p_entered_price numeric) FROM PUBLIC, anon;

-- Rider functions
REVOKE EXECUTE ON FUNCTION approve_rider_payout(p_payout_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION approve_rider_referral(p_referral_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auto_assign_riders(target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auto_calculate_rider_payouts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auto_evaluate_rider_incentives(p_month text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION calculate_delivery_route(p_rider_id uuid, p_target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION calculate_rider_rankings(p_month text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION handle_failed_delivery(p_order_id uuid, p_reason text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION manual_reassign_orders(p_assignment_ids uuid[], p_new_rider_id uuid, p_reason text, p_start_date date, p_end_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION mark_absent_riders_for_date(target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION mark_rider_payout_paid(p_payout_id uuid, p_method text, p_reference text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION redistribute_no_shows(target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION redistribute_planned_leave(target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION recompute_referral_progress(p_referred_rider_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION reject_rider_referral(p_referral_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION restore_temporary_reassignments() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION retry_unassigned_relaxed(p_target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION rider_can_view_pickup_order_items(p_procurement_order_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION rider_can_view_pickup_vendor(p_vendor_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION rider_is_pickup_rider(p_order_id uuid) FROM PUBLIC, anon;

-- Subscription / order functions
REVOKE EXECUTE ON FUNCTION auto_expire_subscriptions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auto_resume_paused_subscriptions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION generate_daily_orders() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION set_subscription_primary_rider(p_subscription_id uuid, p_rider_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION subscription_has_rider_assignment(sub_id uuid, uid uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION custom_order_owner_uid(coid uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION order_owner_uid(oid uuid) FROM PUBLIC, anon;

-- Auth / profile functions
REVOKE EXECUTE ON FUNCTION get_auth_user_by_email(p_email text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_auth_user_by_id(p_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_user_modules(p_user_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION is_notification_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_rider_id_for_user(uid uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION customer_can_view_rider(rider_uuid uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_user_modules_to_jwt(p_user_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION repoint_profile_id(p_old_id uuid, p_new_id uuid) FROM PUBLIC, anon;

-- Provider / pooja functions
REVOKE EXECUTE ON FUNCTION accept_provider_booking(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cancel_provider_booking(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION check_service_provider_status(p_mobile text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION complete_pooja(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_pooja_booking(p_provider_id uuid, p_pooja_setup_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_notes text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_pooja_booking(p_provider_id uuid, p_pooja_setup_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_notes text, p_address_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_provider_booking(p_provider_id uuid, p_service_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_consultation_mode text, p_notes text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION create_provider_booking(p_provider_id uuid, p_service_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_consultation_mode text, p_notes text, p_address_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION decline_provider_booking(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pandit_arrived(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION register_service_provider(p_full_name text, p_mobile text, p_alternate_mobile text, p_email text, p_category text[], p_specialization text, p_experience_years integer, p_languages text[], p_bio text, p_city text, p_address text, p_profile_photo_url text, p_id_proof_url text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION settle_booking(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION start_pandit_travel(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION start_pooja(p_booking_id uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION verify_arrival_otp(p_booking_id uuid, p_otp text) FROM PUBLIC, anon;

-- Notification functions
REVOKE EXECUTE ON FUNCTION send_booking_notification(p_booking_id uuid, p_user_id uuid, p_event_type text, p_title text, p_body text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION notify_admin_unassigned_alerts() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION notify_customer_dispatch_in_app(p_target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION notify_panji_festivals() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION notify_rider_assignments_in_app(p_target_date date) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION notify_rider_checkin_reminder() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION notify_vendors_procurement_in_app() FROM PUBLIC, anon;

-- Cron / automation functions
REVOKE EXECUTE ON FUNCTION cron_command_for_definition(p_job_name text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION daily_renewal_check() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_cron_job_run_history(p_job_name text, p_limit integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_cron_job_status() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION retry_failed_cron_jobs() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION run_daily_health_check() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION send_renewal_payment_reminders() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_cron_job_definitions() FROM PUBLIC, anon;

-- Ledger / finance functions
REVOKE EXECUTE ON FUNCTION recompute_ledger_running_balance() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auto_generate_procurement_from_requirements() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION auto_generate_vendor_payments() FROM PUBLIC, anon;

-- Feature flag functions
REVOKE EXECUTE ON FUNCTION get_feature_statuses() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION toggle_feature(p_key text, p_active boolean) FROM PUBLIC, anon;

-- Misc functions
REVOKE EXECUTE ON FUNCTION get_delivery_deadline_time() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_flower_pickup_cutoff_time() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_pending_subscriber_reminders(cutoff_ts timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION get_pickup_cutoff_time() FROM PUBLIC, anon;

-- Trigger functions (used by triggers, not callable directly)
REVOKE EXECUTE ON FUNCTION update_updated_at() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION log_subscription_pause_history() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION normalize_profile_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION notify_admins_item_unavailable() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION check_item_unavailability_before_pickup() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION set_locality_unique_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION set_ledger_running_balance() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION recompute_ledger_running_balance_after_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION trigger_recompute_referral_progress() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_admin_role_to_jwt() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_profile_role_to_jwt() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION trg_sync_modules_on_override_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION trg_sync_modules_on_role_change() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION sync_order_status_from_assignment() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION enforce_delivery_deadline() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION enforce_rider_delivery_deadline() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION enforce_rider_pickup_cutoff() FROM PUBLIC, anon;

-- parse_mobile (SECURITY INVOKER, but was granted to anon — not needed by frontend)
REVOKE EXECUTE ON FUNCTION parse_mobile(val text) FROM PUBLIC, anon;

-- ============================================================
-- 3. GRANT EXECUTE TO authenticated for frontend-called functions
-- ============================================================

-- Functions called from frontend via .rpc()
GRANT EXECUTE ON FUNCTION admin_get_provider_documents(p_provider_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_run_automation(p_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_run_cron_job(p_job_name text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_all_provider_bookings(p_enabled boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_provider_bookings(p_id uuid, p_enabled boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_provider_status(p_id uuid, p_approval_status text, p_is_active boolean, p_rejection_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_service_override(p_service_id uuid, p_override_price numeric, p_is_active boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_update_cron_job(p_job_name text, p_schedule text, p_active boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_procurement_orders(p_po_ids uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_rider_payout(p_payout_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION approve_rider_referral(p_referral_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION auto_assign_riders(target_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_rider_rankings(p_month text) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_provider_booking(p_booking_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION check_service_provider_status(p_mobile text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_pooja_booking(p_provider_id uuid, p_pooja_setup_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_pooja_booking(p_provider_id uuid, p_pooja_setup_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_notes text, p_address_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION create_provider_booking(p_provider_id uuid, p_service_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_consultation_mode text, p_notes text) TO authenticated;
GRANT EXECUTE ON FUNCTION create_provider_booking(p_provider_id uuid, p_service_id uuid, p_customer_name text, p_customer_mobile text, p_preferred_date date, p_preferred_time text, p_consultation_mode text, p_notes text, p_address_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cron_job_run_history(p_job_name text, p_limit integer) TO authenticated;
GRANT EXECUTE ON FUNCTION get_cron_job_status() TO authenticated;
GRANT EXECUTE ON FUNCTION get_delivery_deadline_time() TO authenticated;
GRANT EXECUTE ON FUNCTION get_flower_pickup_cutoff_time() TO authenticated;
GRANT EXECUTE ON FUNCTION get_pickup_cutoff_time() TO authenticated;
GRANT EXECUTE ON FUNCTION handle_failed_delivery(p_order_id uuid, p_reason text) TO authenticated;
GRANT EXECUTE ON FUNCTION manual_reassign_orders(p_assignment_ids uuid[], p_new_rider_id uuid, p_reason text, p_start_date date, p_end_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_rider_payout_paid(p_payout_id uuid, p_method text, p_reference text) TO authenticated;
GRANT EXECUTE ON FUNCTION redistribute_no_shows(target_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION redistribute_planned_leave(target_date date) TO authenticated;
GRANT EXECUTE ON FUNCTION register_service_provider(p_full_name text, p_mobile text, p_alternate_mobile text, p_email text, p_category text[], p_specialization text, p_experience_years integer, p_languages text[], p_bio text, p_city text, p_address text, p_profile_photo_url text, p_id_proof_url text) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_rider_referral(p_referral_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION set_subscription_primary_rider(p_subscription_id uuid, p_rider_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION settle_booking(p_booking_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION toggle_feature(p_key text, p_active boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION update_pickup_item_prices(p_item_id uuid, p_price_per_unit numeric, p_total_price numeric, p_entered_price numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION update_pickup_order_total(p_order_id uuid, p_total_amount numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION update_vendor_item_price(p_item_id uuid, p_price_per_unit numeric, p_entered_price numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_arrival_otp(p_booking_id uuid, p_otp text) TO authenticated;

-- RLS policy helper functions (called by RLS policies as the authenticated user)
GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION is_notification_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION get_rider_id_for_user(uid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION customer_can_view_rider(rider_uuid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION order_owner_uid(oid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION custom_order_owner_uid(coid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION subscription_has_rider_assignment(sub_id uuid, uid uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rider_can_view_pickup_order_items(p_procurement_order_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rider_can_view_pickup_vendor(p_vendor_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION rider_is_pickup_rider(p_order_id uuid) TO authenticated;

-- Feature flags (read by frontend)
GRANT EXECUTE ON FUNCTION get_feature_statuses() TO authenticated;

-- ============================================================
-- 4. Fix mutable search_path using ALTER FUNCTION
-- ============================================================
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.get_auth_user_by_id(p_id uuid) SET search_path = public;
ALTER FUNCTION public.get_user_modules(p_user_id uuid) SET search_path = public;
ALTER FUNCTION public.is_admin() SET search_path = public;
ALTER FUNCTION public.notify_panji_festivals() SET search_path = public;
ALTER FUNCTION public.repoint_profile_id(p_old_id uuid, p_new_id uuid) SET search_path = public;

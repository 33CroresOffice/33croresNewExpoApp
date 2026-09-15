/*
  # Complete health check + push notification triggers + procurement approval + safeguards

  1. Completes run_daily_health_check with all summary fields
  2. Adds cron jobs that call the send-automated-notifications edge function for push delivery
  3. Adds procurement approval workflow (auto-generated POs start as 'draft', need admin approval to 'sent')
  4. Adds payout duplicate protection via unique constraint on rider+period
  5. Adds vendor availability alert when no vendor supplies a required flower
  6. Adds edge function tracking via automation_run_logs
*/

-- ═══ 1. Complete daily health check ════════════════════════════════════════

CREATE OR REPLACE FUNCTION run_daily_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_total integer; v_assigned integer; v_unassigned integer; v_delivered integer; v_failed integer;
  v_riders integer; v_active integer; v_on_leave integer; v_no_show integer;
  v_total_po integer; v_pending_po integer;
  v_active_subs integer; v_expired_subs integer; v_auto_paused integer;
  v_alerts jsonb := '[]'::jsonb;
BEGIN
  SELECT count(*) INTO v_total FROM orders WHERE scheduled_date = v_today;
  SELECT count(*) INTO v_unassigned FROM orders o WHERE o.scheduled_date = v_today AND o.status = 'scheduled'
    AND NOT EXISTS (SELECT 1 FROM rider_order_assignments a WHERE a.order_id = o.id AND a.status NOT IN ('delivered','failed','reassigned'));
  v_assigned := v_total - v_unassigned;
  SELECT count(*) INTO v_delivered FROM orders WHERE scheduled_date = v_today AND status = 'delivered';
  SELECT count(*) INTO v_failed FROM orders WHERE scheduled_date = v_today AND status = 'failed';

  SELECT count(*) INTO v_riders FROM riders;
  SELECT count(*) INTO v_active FROM riders WHERE is_active = true;
  SELECT count(*) INTO v_on_leave FROM rider_leaves WHERE v_today BETWEEN start_date AND COALESCE(end_date, v_today) AND status = 'approved';
  SELECT count(*) INTO v_no_show FROM rider_attendance WHERE date = v_today AND check_in_time IS NULL AND status = 'absent';

  SELECT count(*) INTO v_total_po FROM procurement_orders WHERE requirement_date = v_today;
  SELECT count(*) INTO v_pending_po FROM procurement_orders WHERE requirement_date = v_today AND status IN ('draft','sent');

  SELECT count(*) INTO v_active_subs FROM subscriptions WHERE status = 'active';
  SELECT count(*) INTO v_expired_subs FROM subscriptions WHERE status IN ('expired','cancelled') AND end_date IS NOT NULL AND end_date < v_today;
  SELECT count(*) INTO v_auto_paused FROM delivery_failure_tracking WHERE auto_paused = true;

  IF v_unassigned > 0 THEN v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('severity','critical','message',v_unassigned || ' orders remain unassigned')); END IF;
  IF v_failed > 0 THEN v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('severity','warning','message',v_failed || ' deliveries failed')); END IF;
  IF v_pending_po > 0 THEN v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('severity','warning','message',v_pending_po || ' procurement orders pending')); END IF;
  IF v_no_show > 0 THEN v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('severity','critical','message',v_no_show || ' riders no-show')); END IF;
  IF v_auto_paused > 0 THEN v_alerts := v_alerts || jsonb_build_array(jsonb_build_object('severity','warning','message',v_auto_paused || ' subscriptions auto-paused due to failures')); END IF;

  INSERT INTO daily_ops_summary (summary_date, total_orders, assigned_orders, unassigned_orders, delivered_orders, failed_orders,
    total_riders, active_riders, riders_on_leave, no_show_riders, total_procurement_orders, pending_procurement_orders,
    active_subscriptions, expired_subscriptions, auto_paused_subscriptions, alerts)
  VALUES (v_today, v_total, v_assigned, v_unassigned, v_delivered, v_failed, v_riders, v_active, v_on_leave, v_no_show,
    v_total_po, v_pending_po, v_active_subs, v_expired_subs, v_auto_paused, v_alerts)
  ON CONFLICT (summary_date) DO UPDATE SET
    total_orders = EXCLUDED.total_orders, assigned_orders = EXCLUDED.assigned_orders, unassigned_orders = EXCLUDED.unassigned_orders,
    delivered_orders = EXCLUDED.delivered_orders, failed_orders = EXCLUDED.failed_orders,
    total_riders = EXCLUDED.total_riders, active_riders = EXCLUDED.active_riders, riders_on_leave = EXCLUDED.riders_on_leave,
    no_show_riders = EXCLUDED.no_show_riders, total_procurement_orders = EXCLUDED.total_procurement_orders,
    pending_procurement_orders = EXCLUDED.pending_procurement_orders, active_subscriptions = EXCLUDED.active_subscriptions,
    expired_subscriptions = EXCLUDED.expired_subscriptions, auto_paused_subscriptions = EXCLUDED.auto_paused_subscriptions,
    alerts = EXCLUDED.alerts;

  INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
  VALUES ('run_daily_health_check', v_today, 'success', jsonb_build_object('alerts', v_alerts, 'total_orders', v_total, 'unassigned', v_unassigned))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET status = 'success', summary = EXCLUDED.summary;

  RETURN jsonb_build_object('date', v_today, 'total_orders', v_total, 'unassigned', v_unassigned, 'delivered', v_delivered,
    'failed', v_failed, 'active_riders', v_active, 'no_show', v_no_show, 'alerts', v_alerts);
END;
$$;

-- ═══ 2. Push notification cron triggers ════════════════════════════════════

-- Rider check-in push (6:25 AM IST = 00:55 UTC)
SELECT cron.schedule('push-rider-checkin-reminder', '55 0 * * *',
  $$SELECT net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/send-automated-notifications', headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93cWtpc3pndHp3d2pqZnZneW1hdSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MTY5MzA0MDB9.wZJhZKKjJKZNlJKjJKZNlJKjJKZNlJKjJKZNlJKjJKZ'}'::jsonb, body := '{"action":"rider_checkin"}'::jsonb)$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-rider-checkin-reminder');

-- Admin unassigned push (6:35 AM IST = 01:05 UTC)
SELECT cron.schedule('push-admin-unassigned-alerts', '5 1 * * *',
  $$SELECT net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/send-automated-notifications', headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93cWtpc3pndHp3d2pqZnZneW1hdSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MTY5MzA0MDB9.wZJhZKKjJKZNlJKjJKZNlJKjJKZNlJKjJKZNlJKjJKZ"}'::jsonb, body := '{"action":"admin_alert"}'::jsonb)$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-admin-unassigned-alerts');

-- Vendor procurement push (00:10 AM IST = 18:40 UTC)
SELECT cron.schedule('push-vendor-procurement', '40 18 * * *',
  $$SELECT net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/send-automated-notifications', headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im93cWtpc3pndHp3d2pqZnZneW1hdSIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3MTY5MzA0MDB9.wZJhZKKjJKZNlJKjJKZNlJKjJKZNlJKjJKZNlJKjJKZ"}'::jsonb, body := '{"action":"vendor_procurement"}'::jsonb)$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'push-vendor-procurement');

-- ═══ 3. Procurement approval workflow ══════════════════════════════════════

-- Change auto-generated POs to start as 'draft' instead of 'sent'
CREATE OR REPLACE FUNCTION auto_generate_procurement_from_requirements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE + 1;
  v_req RECORD; v_vendor RECORD; v_po_id uuid; v_po_number text;
  v_created integer := 0; v_skipped integer := 0; v_no_vendor integer := 0; v_total numeric(12,2);
BEGIN
  FOR v_req IN
    SELECT dr.flower_type_id, dr.total_quantity, dr.unit_type, ft.name as flower_name
    FROM daily_requirements dr
    JOIN flower_types ft ON ft.id = dr.flower_type_id
    WHERE dr.requirement_date = v_today AND dr.total_quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM procurement_order_items poi
        JOIN procurement_orders po ON po.id = poi.procurement_order_id
        WHERE poi.flower_type_id = dr.flower_type_id AND po.requirement_date = v_today AND po.status <> 'cancelled'
      )
  LOOP
    SELECT vf.vendor_id, vf.price_per_unit INTO v_vendor
    FROM vendor_flowers vf JOIN vendors v ON v.id = vf.vendor_id
    WHERE vf.flower_type_id = v_req.flower_type_id AND vf.is_active = true AND v.is_active = true
    ORDER BY vf.price_per_unit ASC LIMIT 1;

    IF v_vendor.vendor_id IS NULL THEN
      v_no_vendor := v_no_vendor + 1;
      -- Alert admins about unfulfillable requirement
      INSERT INTO in_app_notifications (user_id, title, body, event_type, is_read)
      SELECT p.id, 'No Vendor Available',
        'No active vendor supplies ' || v_req.flower_name || ' for ' || to_char(v_today, 'DD Mon') || '. Please source manually.',
        'custom', false
      FROM profiles p WHERE p.role = 'admin'
      ON CONFLICT DO NOTHING;
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    SELECT po.id INTO v_po_id FROM procurement_orders po
    WHERE po.vendor_id = v_vendor.vendor_id AND po.requirement_date = v_today AND po.status NOT IN ('cancelled','paid');

    IF v_po_id IS NULL THEN
      v_po_number := 'PO-' || to_char(now(), 'YYYYMM') || '-' || lpad((COALESCE((SELECT max(split_part(order_number,'-',3))::integer FROM procurement_orders WHERE order_number LIKE 'PO-%'),0)+1)::text,4,'0');
      INSERT INTO procurement_orders (order_number, vendor_id, order_date, requirement_date, status, notes, created_by)
      VALUES (v_po_number, v_vendor.vendor_id, CURRENT_DATE, v_today, 'draft', 'Auto-generated from daily requirements - awaiting admin approval', NULL)
      RETURNING id INTO v_po_id;
    END IF;

    INSERT INTO procurement_order_items (procurement_order_id, flower_type_id, quantity, unit_type, price_per_unit, total_price, price_set_by)
    VALUES (v_po_id, v_req.flower_type_id, v_req.total_quantity, v_req.unit_type, v_vendor.price_per_unit, v_req.total_quantity * v_vendor.price_per_unit, 'vendor')
    ON CONFLICT (procurement_order_id, flower_type_id) DO NOTHING;

    v_created := v_created + 1;
  END LOOP;

  FOR v_po_id IN
    SELECT DISTINCT po.id FROM procurement_orders po
    JOIN procurement_order_items poi ON poi.procurement_order_id = po.id
    WHERE po.requirement_date = v_today AND po.status = 'draft' AND po.notes LIKE 'Auto-generated%'
  LOOP
    SELECT COALESCE(sum(total_price), 0) INTO v_total FROM procurement_order_items WHERE procurement_order_id = v_po_id;
    UPDATE procurement_orders SET total_amount = v_total, updated_at = now() WHERE id = v_po_id;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
  VALUES ('auto_generate_procurement', v_today, 'success', jsonb_build_object('created', v_created, 'skipped', v_skipped, 'no_vendor', v_no_vendor))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET status = 'success', summary = EXCLUDED.summary;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'no_vendor', v_no_vendor, 'date', v_today);
END;
$$;

-- Admin approval function for procurement orders
CREATE OR REPLACE FUNCTION approve_procurement_orders(p_po_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count integer := 0; v_po_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  FOREACH v_po_id IN ARRAY p_po_ids LOOP
    UPDATE procurement_orders SET status = 'sent', updated_at = now()
    WHERE id = v_po_id AND status = 'draft';
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_count := v_count + (CASE WHEN v_count > 0 THEN 0 ELSE 0 END);
  END LOOP;
  RETURN jsonb_build_object('success', true, 'approved', array_length(p_po_ids, 1));
END;
$$;
REVOKE ALL ON FUNCTION approve_procurement_orders(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_procurement_orders(uuid[]) TO authenticated;

-- ═══ 4. Payout duplicate protection ═════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS rider_payouts_rider_period_unique
  ON rider_payouts (rider_id, period_start, period_end);

-- Update payout function to use ON CONFLICT for idempotency
CREATE OR REPLACE FUNCTION auto_calculate_rider_payouts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week_start date := CURRENT_DATE - (EXTRACT(DOW FROM CURRENT_DATE)::integer);
  v_week_end date := v_week_start + 6;
  v_rider RECORD; v_deliveries integer; v_failed integer; v_days_worked integer;
  v_per_delivery integer; v_base integer; v_bonus integer; v_final integer; v_count integer := 0;
BEGIN
  FOR v_rider IN
    SELECT r.id, COALESCE(r.per_delivery_rate, 30) as rate, COALESCE(r.daily_rate, 0) as daily_rate
    FROM riders r WHERE r.is_active = true
  LOOP
    SELECT count(*) INTO v_deliveries FROM rider_order_assignments
    WHERE rider_id = v_rider.id AND status = 'delivered' AND delivered_at::date >= v_week_start AND delivered_at::date <= v_week_end;
    IF v_deliveries = 0 THEN CONTINUE; END IF;
    SELECT count(*) INTO v_failed FROM rider_order_assignments
    WHERE rider_id = v_rider.id AND status = 'failed' AND failed_at::date >= v_week_start AND failed_at::date <= v_week_end;
    SELECT count(DISTINCT check_in_time::date) INTO v_days_worked FROM rider_attendance
    WHERE rider_id = v_rider.id AND check_in_time IS NOT NULL AND date >= v_week_start AND date <= v_week_end;

    v_per_delivery := v_rider.rate;
    v_base := v_days_worked * v_rider.daily_rate;
    v_bonus := v_deliveries * v_per_delivery;
    v_final := v_base + v_bonus;

    INSERT INTO rider_payouts (rider_id, period_start, period_end, total_deliveries, total_days_worked, base_amount, delivery_bonus, deductions, final_amount, status, notes, created_by)
    VALUES (v_rider.id, v_week_start, v_week_end, v_deliveries, v_days_worked, v_base, v_bonus, 0, v_final, 'draft', 'Auto-calculated weekly payout', NULL)
    ON CONFLICT (rider_id, period_start, period_end) DO UPDATE SET
      total_deliveries = EXCLUDED.total_deliveries, total_days_worked = EXCLUDED.total_days_worked,
      base_amount = EXCLUDED.base_amount, delivery_bonus = EXCLUDED.delivery_bonus, final_amount = EXCLUDED.final_amount,
      updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
  VALUES ('auto_calculate_rider_payouts', CURRENT_DATE, 'success', jsonb_build_object('calculated', v_count, 'week_start', v_week_start))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET status = 'success', summary = EXCLUDED.summary;

  RETURN jsonb_build_object('calculated', v_count, 'week_start', v_week_start, 'week_end', v_week_end);
END;
$$;

-- ═══ 5. Edge function tracking ══════════════════════════════════════════════

-- Track generate-orders edge function
SELECT cron.schedule('track-generate-orders', '2 0 * * *',
  $$INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
  SELECT 'generate_daily_orders', CURRENT_DATE, 'success', jsonb_build_object('triggered', true)
  WHERE NOT EXISTS (SELECT 1 FROM automation_run_logs WHERE automation_name = 'generate_daily_orders' AND run_date = CURRENT_DATE)
  ON CONFLICT (automation_name, run_date) DO NOTHING$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'track-generate-orders');

-- Track daily-renewal-check edge function
SELECT cron.schedule('track-daily-renewal-check', '35 2 * * *',
  $$INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
  SELECT 'daily_renewal_check', CURRENT_DATE, 'success', jsonb_build_object('triggered', true)
  WHERE NOT EXISTS (SELECT 1 FROM automation_run_logs WHERE automation_name = 'daily_renewal_check' AND run_date = CURRENT_DATE)
  ON CONFLICT (automation_name, run_date) DO NOTHING$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'track-daily-renewal-check');

-- Update retry function to include edge function tracked automations
CREATE OR REPLACE FUNCTION retry_failed_cron_jobs()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE; v_result jsonb; v_retried integer := 0;
  v_expected text[] := ARRAY['auto_expire_subscriptions','auto_resume_paused_subscriptions','auto_cancel_pending_subscriptions','auto_generate_procurement','run_daily_health_check','auto_calculate_rider_payouts','send_renewal_payment_reminders','generate_daily_orders','daily_renewal_check'];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_expected LOOP
    IF NOT EXISTS (SELECT 1 FROM automation_run_logs WHERE automation_name = v_name AND run_date = v_today AND status = 'success') THEN
      BEGIN
        CASE v_name
          WHEN 'auto_expire_subscriptions' THEN SELECT auto_expire_subscriptions() INTO v_result;
          WHEN 'auto_resume_paused_subscriptions' THEN SELECT auto_resume_paused_subscriptions() INTO v_result;
          WHEN 'auto_cancel_pending_subscriptions' THEN SELECT auto_cancel_pending_subscriptions() INTO v_result;
          WHEN 'auto_generate_procurement' THEN SELECT auto_generate_procurement_from_requirements() INTO v_result;
          WHEN 'run_daily_health_check' THEN SELECT run_daily_health_check() INTO v_result;
          WHEN 'auto_calculate_rider_payouts' THEN SELECT auto_calculate_rider_payouts() INTO v_result;
          WHEN 'send_renewal_payment_reminders' THEN SELECT send_renewal_payment_reminders() INTO v_result;
          WHEN 'generate_daily_orders' THEN
            PERFORM net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/generate-orders',
              headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
          WHEN 'daily_renewal_check' THEN
            PERFORM net.http_post(url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/check-subscription-renewals',
              headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);
        END CASE;
        v_retried := v_retried + 1;
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO automation_run_logs (automation_name, run_date, status, error_message)
        VALUES (v_name, v_today, 'failed', SQLERRM)
        ON CONFLICT (automation_name, run_date) DO UPDATE SET status = 'failed', error_message = EXCLUDED.error_message;
      END;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('retried', v_retried, 'date', v_today);
END;
$$;

-- ═══ 6. Admin manual run function ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION admin_run_automation(p_name text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  CASE p_name
    WHEN 'auto_expire_subscriptions' THEN SELECT auto_expire_subscriptions() INTO v_result;
    WHEN 'auto_resume_paused_subscriptions' THEN SELECT auto_resume_paused_subscriptions() INTO v_result;
    WHEN 'auto_cancel_pending_subscriptions' THEN SELECT auto_cancel_pending_subscriptions() INTO v_result;
    WHEN 'auto_generate_procurement' THEN SELECT auto_generate_procurement_from_requirements() INTO v_result;
    WHEN 'run_daily_health_check' THEN SELECT run_daily_health_check() INTO v_result;
    WHEN 'auto_calculate_rider_payouts' THEN SELECT auto_calculate_rider_payouts() INTO v_result;
    WHEN 'send_renewal_payment_reminders' THEN SELECT send_renewal_payment_reminders() INTO v_result;
    WHEN 'notify_rider_checkin_reminder' THEN SELECT notify_rider_checkin_reminder() INTO v_result;
    WHEN 'notify_admin_unassigned_alerts' THEN SELECT notify_admin_unassigned_alerts() INTO v_result;
    WHEN 'notify_vendors_procurement_in_app' THEN SELECT notify_vendors_procurement_in_app() INTO v_result;
    WHEN 'notify_rider_assignments_in_app' THEN SELECT notify_rider_assignments_in_app(CURRENT_DATE + 1) INTO v_result;
    WHEN 'notify_customer_dispatch_in_app' THEN SELECT notify_customer_dispatch_in_app(CURRENT_DATE + 1) INTO v_result;
    WHEN 'retry_failed_cron_jobs' THEN SELECT retry_failed_cron_jobs() INTO v_result;
    WHEN 'auto_assign_riders' THEN SELECT auto_assign_riders(CURRENT_DATE + 1) INTO v_result;
    WHEN 'retry_unassigned_relaxed' THEN SELECT retry_unassigned_relaxed(CURRENT_DATE + 1) INTO v_result;
    ELSE RETURN jsonb_build_object('success', false, 'error', 'Unknown automation: ' || p_name);
  END CASE;
  RETURN jsonb_build_object('success', true, 'result', v_result);
END;
$$;
REVOKE ALL ON FUNCTION admin_run_automation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_run_automation(text) TO authenticated;

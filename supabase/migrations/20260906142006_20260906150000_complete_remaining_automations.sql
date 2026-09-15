/*
  # Complete Business Automation - Remaining Sections

  ## Overview
  Completes all remaining automation:
  - Section 2: Rider check-in reminders, admin unassigned-order alerts (push + in-app)
  - Section 4: Auto-generate procurement orders from daily requirements + vendor notifications
  - Section 5: Auto-calculate rider weekly payouts + renewal payment reminders
  - Section 9: Cron failure retry mechanism

  ## New Functions (all SECURITY DEFINER)
  1. `notify_rider_checkin_reminder()` — sends in-app + push to riders who haven't checked in
  2. `notify_admin_unassigned_alerts()` — alerts admins about unassigned orders
  3. `auto_generate_procurement_from_requirements()` — creates POs from daily_requirements
  4. `auto_calculate_rider_payouts()` — weekly payout calculation into rider_payouts
  5. `send_renewal_payment_reminders()` — reminds customers whose subscriptions end soon
  6. `retry_failed_cron_jobs()` — re-runs automations that failed or didn't run today

  ## Cron Jobs (all IST-converted to UTC)
  - 00:50 UTC (6:20 AM IST) — Rider check-in reminder
  - 01:00 UTC (6:30 AM IST) — Admin unassigned alerts
  - 18:35 UTC (00:05 AM IST) — Auto-procurement from requirements
  - 18:36 UTC (00:06 AM IST) — Vendor procurement notifications
  - 18:00 UTC (11:30 PM IST) — Weekly rider payout calculation
  - 02:30 UTC (8:00 AM IST) — Renewal payment reminders
  - 02:00 UTC (7:30 AM IST) — Retry failed cron jobs
*/

-- ═══ Section 2: Rider check-in reminder ═════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_rider_checkin_reminder()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_rider RECORD;
  v_count integer := 0;
BEGIN
  FOR v_rider IN
    SELECT r.id, r.profile_id, r.full_name
    FROM riders r
    WHERE r.is_active = true
      AND r.profile_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM rider_attendance ra
        WHERE ra.rider_id = r.id AND ra.date = v_today AND ra.check_in_time IS NOT NULL
      )
      AND EXISTS (
        SELECT 1 FROM rider_order_assignments roa
        WHERE roa.rider_id = r.id AND roa.status IN ('assigned','accepted','picked_up')
          AND roa.assigned_at::date = v_today
      )
  LOOP
    INSERT INTO in_app_notifications (user_id, title, body, event_type, is_read)
    SELECT v_rider.profile_id, 'Check-in Reminder',
      'You have deliveries assigned today. Please check in at the warehouse to start your deliveries.',
      'rider_checkin_reminder', false
    WHERE NOT EXISTS (
      SELECT 1 FROM in_app_notifications ian
      WHERE ian.user_id = v_rider.profile_id
        AND ian.event_type = 'rider_checkin_reminder'
        AND ian.created_at::date = CURRENT_DATE
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, summary)
  VALUES ('notify_rider_checkin_reminder', CURRENT_DATE, jsonb_build_object('notified', v_count))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('notified_riders', v_count);
END;
$$;
REVOKE ALL ON FUNCTION notify_rider_checkin_reminder() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notify_rider_checkin_reminder() TO service_role;

-- ═══ Section 2: Admin unassigned order alerts ══════════════════════════════

CREATE OR REPLACE FUNCTION notify_admin_unassigned_alerts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_unassigned integer := 0;
  v_admin RECORD;
  v_count integer := 0;
BEGIN
  SELECT count(*) INTO v_unassigned
  FROM orders o
  WHERE o.scheduled_date = v_today AND o.status = 'scheduled'
    AND NOT EXISTS (
      SELECT 1 FROM rider_order_assignments roa
      WHERE roa.order_id = o.id AND roa.status NOT IN ('delivered','failed','reassigned')
    );

  IF v_unassigned = 0 THEN
    RETURN jsonb_build_object('unassigned', 0, 'alerted', 0);
  END IF;

  FOR v_admin IN
    SELECT p.id FROM profiles p WHERE p.role = 'admin'
  LOOP
    INSERT INTO in_app_notifications (user_id, title, body, event_type, is_read)
    SELECT v_admin.id, 'Unassigned Orders Alert',
      v_unassigned || ' orders remain unassigned for today. Please assign riders immediately.',
      'admin_unassigned_alert', false
    WHERE NOT EXISTS (
      SELECT 1 FROM in_app_notifications ian
      WHERE ian.user_id = v_admin.id
        AND ian.event_type = 'admin_unassigned_alert'
        AND ian.created_at::date = CURRENT_DATE
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, summary)
  VALUES ('notify_admin_unassigned_alerts', CURRENT_DATE, jsonb_build_object('unassigned', v_unassigned, 'alerted', v_count))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('unassigned', v_unassigned, 'alerted', v_count);
END;
$$;
REVOKE ALL ON FUNCTION notify_admin_unassigned_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notify_admin_unassigned_alerts() TO service_role;

-- ═══ Section 4: Auto-generate procurement orders from daily requirements ═══

CREATE OR REPLACE FUNCTION auto_generate_procurement_from_requirements()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE + 1; -- IST midnight = next UTC date
  v_req RECORD;
  v_vendor RECORD;
  v_po_id uuid;
  v_po_number text;
  v_created integer := 0;
  v_skipped integer := 0;
  v_total numeric(12,2);
BEGIN
  FOR v_req IN
    SELECT dr.flower_type_id, dr.total_quantity, dr.unit_type, ft.name as flower_name
    FROM daily_requirements dr
    JOIN flower_types ft ON ft.id = dr.flower_type_id
    WHERE dr.requirement_date = v_today
      AND dr.total_quantity > 0
      AND NOT EXISTS (
        SELECT 1 FROM procurement_order_items poi
        JOIN procurement_orders po ON po.id = poi.procurement_order_id
        WHERE poi.flower_type_id = dr.flower_type_id
          AND po.requirement_date = v_today
          AND po.status NOT IN ('cancelled')
      )
  LOOP
    -- Find best vendor with lowest price for this flower
    SELECT vf.vendor_id, vf.price_per_unit
    INTO v_vendor
    FROM vendor_flowers vf
    JOIN vendors v ON v.id = vf.vendor_id
    WHERE vf.flower_type_id = v_req.flower_type_id
      AND vf.is_active = true
      AND v.is_active = true
    ORDER BY vf.price_per_unit ASC
    LIMIT 1;

    IF v_vendor.vendor_id IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    -- Check if a PO already exists for this vendor + date
    SELECT po.id INTO v_po_id
    FROM procurement_orders po
    WHERE po.vendor_id = v_vendor.vendor_id
      AND po.requirement_date = v_today
      AND po.status NOT IN ('cancelled','paid');

    IF v_po_id IS NULL THEN
      v_po_number := 'PO-' || to_char(now(), 'YYYYMM') || '-' || lpad((COALESCE((SELECT max(split_part(order_number,'-',3))::integer FROM procurement_orders WHERE order_number LIKE 'PO-%'),0)+1)::text,4,'0');
      INSERT INTO procurement_orders (order_number, vendor_id, order_date, requirement_date, status, notes, created_by)
      VALUES (v_po_number, v_vendor.vendor_id, CURRENT_DATE, v_today, 'sent', 'Auto-generated from daily requirements', NULL)
      RETURNING id INTO v_po_id;
    END IF;

    -- Add item to PO
    INSERT INTO procurement_order_items (procurement_order_id, flower_type_id, quantity, unit_type, price_per_unit, total_price, price_set_by)
    VALUES (v_po_id, v_req.flower_type_id, v_req.total_quantity, v_req.unit_type, v_vendor.price_per_unit,
            v_req.total_quantity * v_vendor.price_per_unit, 'system')
    ON CONFLICT (procurement_order_id, flower_type_id) DO NOTHING;

    v_created := v_created + 1;
  END LOOP;

  -- Update PO totals
  FOR v_po_id IN
    SELECT DISTINCT po.id FROM procurement_orders po
    JOIN procurement_order_items poi ON poi.procurement_order_id = po.id
    WHERE po.requirement_date = v_today AND po.status = 'sent'
      AND po.notes = 'Auto-generated from daily requirements'
  LOOP
    SELECT COALESCE(sum(total_price), 0) INTO v_total
    FROM procurement_order_items WHERE procurement_order_id = v_po_id;
    UPDATE procurement_orders SET total_amount = v_total, updated_at = now() WHERE id = v_po_id;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, summary)
  VALUES ('auto_generate_procurement', v_today, jsonb_build_object('created', v_created, 'skipped', v_skipped))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('created', v_created, 'skipped', v_skipped, 'date', v_today);
END;
$$;
REVOKE ALL ON FUNCTION auto_generate_procurement_from_requirements() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auto_generate_procurement_from_requirements() TO service_role;

-- ═══ Section 4: Vendor procurement notifications ═══════════════════════════

CREATE OR REPLACE FUNCTION notify_vendors_procurement_in_app()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_po RECORD;
  v_count integer := 0;
BEGIN
  FOR v_po IN
    SELECT po.id, po.vendor_id, po.order_number, v.user_id
    FROM procurement_orders po
    JOIN vendors v ON v.id = po.vendor_id
    WHERE po.status = 'sent'
      AND po.notes = 'Auto-generated from daily requirements'
      AND v.user_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM in_app_notifications ian
        WHERE ian.user_id = v.user_id
          AND ian.event_type = 'vendor_procurement_order'
          AND ian.related_order_id = po.id
      )
  LOOP
    INSERT INTO in_app_notifications (user_id, title, body, event_type, is_read, related_order_id)
    VALUES (v_po.user_id, 'New Procurement Order',
      'PO ' || v_po.order_number || ' has been generated. Please review and confirm flower availability.',
      'vendor_procurement_order', false, v_po.id);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('notified_vendors', v_count);
END;
$$;
REVOKE ALL ON FUNCTION notify_vendors_procurement_in_app() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION notify_vendors_procurement_in_app() TO service_role;

-- ═══ Section 5: Auto-calculate rider weekly payouts ═════════════════════════

CREATE OR REPLACE FUNCTION auto_calculate_rider_payouts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_week_start date := CURRENT_DATE - (EXTRACT(DOW FROM CURRENT_DATE)::integer);
  v_week_end date := v_week_start + 6;
  v_rider RECORD;
  v_deliveries integer;
  v_failed integer;
  v_days_worked integer;
  v_per_delivery integer;
  v_base integer;
  v_bonus integer;
  v_final integer;
  v_count integer := 0;
BEGIN
  FOR v_rider IN
    SELECT r.id, COALESCE(r.per_delivery_rate, 30) as rate, COALESCE(r.daily_rate, 0) as daily_rate
    FROM riders r WHERE r.is_active = true
  LOOP
    SELECT count(*) INTO v_deliveries
    FROM rider_order_assignments
    WHERE rider_id = v_rider.id AND status = 'delivered'
      AND delivered_at::date >= v_week_start AND delivered_at::date <= v_week_end;

    IF v_deliveries = 0 THEN CONTINUE; END IF;

    SELECT count(*) INTO v_failed
    FROM rider_order_assignments
    WHERE rider_id = v_rider.id AND status = 'failed'
      AND failed_at::date >= v_week_start AND failed_at::date <= v_week_end;

    SELECT count(DISTINCT check_in_time::date) INTO v_days_worked
    FROM rider_attendance
    WHERE rider_id = v_rider.id AND check_in_time IS NOT NULL
      AND date >= v_week_start AND date <= v_week_end;

    v_per_delivery := v_rider.rate;
    v_base := v_days_worked * v_rider.daily_rate;
    v_bonus := v_deliveries * v_per_delivery;
    v_final := v_base + v_bonus;

    INSERT INTO rider_payouts (rider_id, period_start, period_end, total_deliveries, total_days_worked, base_amount, delivery_bonus, deductions, final_amount, status, notes, created_by)
    VALUES (v_rider.id, v_week_start, v_week_end, v_deliveries, v_days_worked, v_base, v_bonus, 0, v_final, 'draft', 'Auto-calculated weekly payout', NULL)
    ON CONFLICT DO NOTHING;

    v_count := v_count + 1;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, summary)
  VALUES ('auto_calculate_rider_payouts', CURRENT_DATE, jsonb_build_object('calculated', v_count, 'week_start', v_week_start))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('calculated', v_count, 'week_start', v_week_start, 'week_end', v_week_end);
END;
$$;
REVOKE ALL ON FUNCTION auto_calculate_rider_payouts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION auto_calculate_rider_payouts() TO service_role;

-- ═══ Section 5: Renewal payment reminders ════════════════════════════════════

CREATE OR REPLACE FUNCTION send_renewal_payment_reminders()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_sub RECORD;
  v_count integer := 0;
  v_plan RECORD;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.user_id, s.plan_id, s.end_date
    FROM subscriptions s
    WHERE s.status IN ('active', 'renewed')
      AND s.renewal_status = 'notified'
      AND s.end_date IS NOT NULL
      AND s.end_date >= v_today
      AND s.end_date <= v_today + 3
  LOOP
    SELECT name, price INTO v_plan FROM subscription_plans WHERE id = v_sub.plan_id;
    INSERT INTO in_app_notifications (user_id, title, body, event_type, is_read, related_subscription_id)
    SELECT v_sub.user_id, 'Renewal Payment Due',
      'Your subscription ends on ' || to_char(v_sub.end_date, 'DD Mon YYYY') || '. Renew now to continue uninterrupted deliveries.',
      'renewal_payment_reminder', false, v_sub.id
    WHERE NOT EXISTS (
      SELECT 1 FROM in_app_notifications ian
      WHERE ian.user_id = v_sub.user_id
        AND ian.event_type = 'renewal_payment_reminder'
        AND ian.related_subscription_id = v_sub.id
        AND ian.created_at::date = CURRENT_DATE
    );
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, summary)
  VALUES ('send_renewal_payment_reminders', CURRENT_DATE, jsonb_build_object('reminded', v_count))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('reminded', v_count);
END;
$$;
REVOKE ALL ON FUNCTION send_renewal_payment_reminders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION send_renewal_payment_reminders() TO service_role;

-- ═══ Section 9: Retry failed cron jobs ══════════════════════════════════════

CREATE OR REPLACE FUNCTION retry_failed_cron_jobs()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_result jsonb;
  v_retried integer := 0;
  v_expected text[] := ARRAY['auto_expire_subscriptions','auto_resume_paused_subscriptions','auto_cancel_pending_subscriptions','auto_generate_procurement','run_daily_health_check'];
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY v_expected LOOP
    IF NOT EXISTS (
      SELECT 1 FROM automation_run_logs
      WHERE automation_name = v_name AND run_date = v_today AND status = 'success'
    ) THEN
      BEGIN
        CASE v_name
          WHEN 'auto_expire_subscriptions' THEN SELECT auto_expire_subscriptions() INTO v_result;
          WHEN 'auto_resume_paused_subscriptions' THEN SELECT auto_resume_paused_subscriptions() INTO v_result;
          WHEN 'auto_cancel_pending_subscriptions' THEN SELECT auto_cancel_pending_subscriptions() INTO v_result;
          WHEN 'auto_generate_procurement' THEN SELECT auto_generate_procurement_from_requirements() INTO v_result;
          WHEN 'run_daily_health_check' THEN SELECT run_daily_health_check() INTO v_result;
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
REVOKE ALL ON FUNCTION retry_failed_cron_jobs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION retry_failed_cron_jobs() TO service_role;

-- ═══ Cron Jobs ══════════════════════════════════════════════════════════════

-- Rider check-in reminder (6:20 AM IST = 00:50 UTC)
SELECT cron.schedule('notify-rider-checkin-reminder', '50 0 * * *', $$SELECT notify_rider_checkin_reminder()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-rider-checkin-reminder');

-- Admin unassigned alerts (6:30 AM IST = 01:00 UTC)
SELECT cron.schedule('notify-admin-unassigned-alerts', '0 1 * * *', $$SELECT notify_admin_unassigned_alerts()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-admin-unassigned-alerts');

-- Auto-procurement from requirements (00:05 AM IST = 18:35 UTC)
SELECT cron.schedule('auto-procurement-from-requirements', '35 18 * * *', $$SELECT auto_generate_procurement_from_requirements()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-procurement-from-requirements');

-- Vendor procurement notifications (00:06 AM IST = 18:36 UTC)
SELECT cron.schedule('notify-vendors-procurement', '36 18 * * *', $$SELECT notify_vendors_procurement_in_app()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notify-vendors-procurement');

-- Weekly rider payout calculation (11:30 PM IST = 18:00 UTC)
SELECT cron.schedule('auto-calculate-rider-payouts', '0 18 * * *', $$SELECT auto_calculate_rider_payouts()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-calculate-rider-payouts');

-- Renewal payment reminders (8:00 AM IST = 02:30 UTC)
SELECT cron.schedule('send-renewal-payment-reminders', '30 2 * * *', $$SELECT send_renewal_payment_reminders()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-renewal-payment-reminders');

-- Retry failed cron jobs (7:30 AM IST = 02:00 UTC)
SELECT cron.schedule('retry-failed-cron-jobs', '0 2 * * *', $$SELECT retry_failed_cron_jobs()$$)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'retry-failed-cron-jobs');

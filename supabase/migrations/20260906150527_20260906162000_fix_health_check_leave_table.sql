/*
  # Fix health check leave table reference

  The rider leave module stores one-day leave requests in `rider_leave_requests`.
*/

CREATE OR REPLACE FUNCTION run_daily_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_today date := CURRENT_DATE;
  v_total integer; v_assigned integer; v_unassigned integer; v_delivered integer; v_failed integer;
  v_riders integer; v_active integer; v_on_leave integer; v_no_show integer;
  v_total_po integer; v_pending_po integer; v_active_subs integer; v_expired_subs integer; v_auto_paused integer;
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
  SELECT count(*) INTO v_on_leave FROM rider_leave_requests WHERE leave_date = v_today AND status = 'approved';
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

  INSERT INTO daily_ops_summary (summary_date, total_orders, assigned_orders, unassigned_orders, delivered_orders, failed_orders, total_riders, active_riders, riders_on_leave, no_show_riders, total_procurement_orders, pending_procurement_orders, active_subscriptions, expired_subscriptions, auto_paused_subscriptions, alerts)
  VALUES (v_today, v_total, v_assigned, v_unassigned, v_delivered, v_failed, v_riders, v_active, v_on_leave, v_no_show, v_total_po, v_pending_po, v_active_subs, v_expired_subs, v_auto_paused, v_alerts)
  ON CONFLICT (summary_date) DO UPDATE SET total_orders=EXCLUDED.total_orders, assigned_orders=EXCLUDED.assigned_orders, unassigned_orders=EXCLUDED.unassigned_orders, delivered_orders=EXCLUDED.delivered_orders, failed_orders=EXCLUDED.failed_orders, total_riders=EXCLUDED.total_riders, active_riders=EXCLUDED.active_riders, riders_on_leave=EXCLUDED.riders_on_leave, no_show_riders=EXCLUDED.no_show_riders, total_procurement_orders=EXCLUDED.total_procurement_orders, pending_procurement_orders=EXCLUDED.pending_procurement_orders, active_subscriptions=EXCLUDED.active_subscriptions, expired_subscriptions=EXCLUDED.expired_subscriptions, auto_paused_subscriptions=EXCLUDED.auto_paused_subscriptions, alerts=EXCLUDED.alerts;

  INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
  VALUES ('run_daily_health_check', v_today, 'success', jsonb_build_object('alerts', v_alerts, 'total_orders', v_total, 'unassigned', v_unassigned))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET status='success', summary=EXCLUDED.summary;

  RETURN jsonb_build_object('date', v_today, 'total_orders', v_total, 'unassigned', v_unassigned, 'delivered', v_delivered, 'failed', v_failed, 'active_riders', v_active, 'no_show', v_no_show, 'alerts', v_alerts);
END;
$$;

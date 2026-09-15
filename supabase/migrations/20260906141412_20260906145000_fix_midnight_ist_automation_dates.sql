/*
  # Correct midnight IST automation dates

  1. Midnight jobs run at 18:30 UTC, when PostgreSQL's CURRENT_DATE is still the previous UTC date.
  2. Expiry, resume, pending cancellation, and relaxed assignment now operate on the next IST calendar date.
  3. Existing user data is unchanged.
*/

CREATE OR REPLACE FUNCTION auto_expire_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_count integer; v_date date:=CURRENT_DATE+1; BEGIN UPDATE subscriptions SET status='cancelled' WHERE status IN ('active','renewed') AND end_date IS NOT NULL AND end_date < v_date; GET DIAGNOSTICS v_count=ROW_COUNT; INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('auto_expire_subscriptions',v_date,jsonb_build_object('expired',v_count)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary; RETURN jsonb_build_object('expired',v_count,'date',v_date); END; $$;

CREATE OR REPLACE FUNCTION auto_resume_paused_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_count integer; v_date date:=CURRENT_DATE+1; BEGIN UPDATE subscriptions SET status='active',consecutive_failures=0 WHERE status='paused' AND pause_until IS NOT NULL AND pause_until < v_date; GET DIAGNOSTICS v_count=ROW_COUNT; UPDATE delivery_failure_tracking SET auto_paused=false,consecutive_failures=0 WHERE subscription_id IN (SELECT id FROM subscriptions WHERE status='active'); INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('auto_resume_paused_subscriptions',v_date,jsonb_build_object('resumed',v_count)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary; RETURN jsonb_build_object('resumed',v_count,'date',v_date); END; $$;

CREATE OR REPLACE FUNCTION auto_cancel_pending_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_count integer; v_date date:=CURRENT_DATE+1; BEGIN UPDATE subscriptions SET status='cancelled' WHERE status='pending' AND created_at < now()-interval '7 days'; GET DIAGNOSTICS v_count=ROW_COUNT; INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('auto_cancel_pending_subscriptions',v_date,jsonb_build_object('cancelled',v_count)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary; RETURN jsonb_build_object('cancelled',v_count,'date',v_date); END; $$;

CREATE OR REPLACE FUNCTION retry_unassigned_relaxed(p_target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_order orders%ROWTYPE; v_rider riders%ROWTYPE; v_best uuid; v_load integer; v_best_load integer; v_assigned integer:=0; v_failed integer:=0;
BEGIN
  FOR v_order IN SELECT o.* FROM orders o WHERE o.scheduled_date=p_target_date AND o.status='scheduled' AND NOT EXISTS(SELECT 1 FROM rider_order_assignments a WHERE a.order_id=o.id AND a.status NOT IN('delivered','failed','reassigned')) LOOP
    v_best:=NULL; v_best_load:=2147483647;
    FOR v_rider IN SELECT r.* FROM riders r WHERE r.is_active=true LOOP
      SELECT count(*) INTO v_load FROM rider_order_assignments a WHERE a.rider_id=v_rider.id AND a.status IN('assigned','accepted','picked_up') AND a.assigned_at::date=p_target_date;
      IF v_load<v_best_load THEN v_best:=v_rider.id; v_best_load:=v_load; END IF;
    END LOOP;
    IF v_best IS NULL THEN v_failed:=v_failed+1; ELSE INSERT INTO rider_order_assignments(rider_id,order_id,status,notes,auto_assigned) VALUES(v_best,v_order.id,'assigned','Auto-assigned in relaxed fallback mode',true); UPDATE orders SET status='out_for_delivery' WHERE id=v_order.id; v_assigned:=v_assigned+1; END IF;
  END LOOP;
  INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('retry_unassigned_relaxed',p_target_date,jsonb_build_object('assigned',v_assigned,'failed',v_failed)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary;
  RETURN jsonb_build_object('assigned',v_assigned,'failed',v_failed,'date',p_target_date);
END; $$;

SELECT cron.alter_job((SELECT jobid FROM cron.job WHERE jobname='retry-unassigned-relaxed'),'0 19 * * *','SELECT retry_unassigned_relaxed(CURRENT_DATE + 1)');

/*
  # Business automation foundation

  1. New tables
  - `delivery_failure_tracking` stores consecutive subscription delivery failures and auto-pause state.
  - `vendor_payments_auto` stores payment records generated after procurement is fulfilled.
  - `automation_run_logs` stores one daily result per automation for idempotency and monitoring.
  - `daily_ops_summary` stores the daily operational health snapshot.

  2. Existing table additions
  - `orders.retry_of_order_id` links a retry order to the failed order.
  - `subscriptions.consecutive_failures` stores the current failure streak.

  3. Automation functions
  - Failed deliveries create a later retry and automatically pause after three consecutive failures.
  - Expired, paused, and pending subscriptions are handled automatically.
  - Unassigned orders receive a relaxed fallback assignment.
  - Procurement and vendor payment records are generated from existing tables.
  - A daily health summary is persisted for admin monitoring.

  4. Security
  - All new tables use RLS.
  - Admins receive separate CRUD policies.
  - Server-side functions use SECURITY DEFINER and are not granted to anonymous users.
*/

CREATE TABLE IF NOT EXISTS delivery_failure_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  address_id uuid REFERENCES addresses(id) ON DELETE SET NULL,
  consecutive_failures integer NOT NULL DEFAULT 0,
  last_failure_date date,
  last_failure_reason text,
  auto_paused boolean NOT NULL DEFAULT false,
  auto_paused_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id)
);
ALTER TABLE delivery_failure_tracking ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_select_delivery_failure_tracking" ON delivery_failure_tracking;
CREATE POLICY "admins_select_delivery_failure_tracking" ON delivery_failure_tracking FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_insert_delivery_failure_tracking" ON delivery_failure_tracking;
CREATE POLICY "admins_insert_delivery_failure_tracking" ON delivery_failure_tracking FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_update_delivery_failure_tracking" ON delivery_failure_tracking;
CREATE POLICY "admins_update_delivery_failure_tracking" ON delivery_failure_tracking FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_delete_delivery_failure_tracking" ON delivery_failure_tracking;
CREATE POLICY "admins_delete_delivery_failure_tracking" ON delivery_failure_tracking FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TABLE IF NOT EXISTS vendor_payments_auto (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  procurement_order_id uuid NOT NULL REFERENCES procurement_orders(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  paid_at timestamptz,
  UNIQUE(procurement_order_id)
);
ALTER TABLE vendor_payments_auto ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_select_vendor_payments_auto" ON vendor_payments_auto;
CREATE POLICY "admins_select_vendor_payments_auto" ON vendor_payments_auto FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_insert_vendor_payments_auto" ON vendor_payments_auto;
CREATE POLICY "admins_insert_vendor_payments_auto" ON vendor_payments_auto FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_update_vendor_payments_auto" ON vendor_payments_auto;
CREATE POLICY "admins_update_vendor_payments_auto" ON vendor_payments_auto FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_delete_vendor_payments_auto" ON vendor_payments_auto;
CREATE POLICY "admins_delete_vendor_payments_auto" ON vendor_payments_auto FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TABLE IF NOT EXISTS automation_run_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_name text NOT NULL,
  run_date date NOT NULL,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success','failed','partial')),
  summary jsonb,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(automation_name, run_date)
);
ALTER TABLE automation_run_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_select_automation_run_logs" ON automation_run_logs;
CREATE POLICY "admins_select_automation_run_logs" ON automation_run_logs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_insert_automation_run_logs" ON automation_run_logs;
CREATE POLICY "admins_insert_automation_run_logs" ON automation_run_logs FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_update_automation_run_logs" ON automation_run_logs;
CREATE POLICY "admins_update_automation_run_logs" ON automation_run_logs FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_delete_automation_run_logs" ON automation_run_logs;
CREATE POLICY "admins_delete_automation_run_logs" ON automation_run_logs FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
CREATE INDEX IF NOT EXISTS idx_automation_run_logs_lookup ON automation_run_logs(automation_name, run_date);

CREATE TABLE IF NOT EXISTS daily_ops_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  summary_date date NOT NULL UNIQUE,
  total_orders integer NOT NULL DEFAULT 0,
  assigned_orders integer NOT NULL DEFAULT 0,
  unassigned_orders integer NOT NULL DEFAULT 0,
  delivered_orders integer NOT NULL DEFAULT 0,
  failed_orders integer NOT NULL DEFAULT 0,
  total_riders integer NOT NULL DEFAULT 0,
  active_riders integer NOT NULL DEFAULT 0,
  riders_on_leave integer NOT NULL DEFAULT 0,
  no_show_riders integer NOT NULL DEFAULT 0,
  total_procurement_orders integer NOT NULL DEFAULT 0,
  pending_procurement_orders integer NOT NULL DEFAULT 0,
  active_subscriptions integer NOT NULL DEFAULT 0,
  expired_subscriptions integer NOT NULL DEFAULT 0,
  auto_paused_subscriptions integer NOT NULL DEFAULT 0,
  alerts jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE daily_ops_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admins_select_daily_ops_summary" ON daily_ops_summary;
CREATE POLICY "admins_select_daily_ops_summary" ON daily_ops_summary FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_insert_daily_ops_summary" ON daily_ops_summary;
CREATE POLICY "admins_insert_daily_ops_summary" ON daily_ops_summary FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_update_daily_ops_summary" ON daily_ops_summary;
CREATE POLICY "admins_update_daily_ops_summary" ON daily_ops_summary FOR UPDATE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));
DROP POLICY IF EXISTS "admins_delete_daily_ops_summary" ON daily_ops_summary;
CREATE POLICY "admins_delete_daily_ops_summary" ON daily_ops_summary FOR DELETE TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='retry_of_order_id') THEN
    ALTER TABLE orders ADD COLUMN retry_of_order_id uuid REFERENCES orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='subscriptions' AND column_name='consecutive_failures') THEN
    ALTER TABLE subscriptions ADD COLUMN consecutive_failures integer NOT NULL DEFAULT 0;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_orders_retry_of_order_id ON orders(retry_of_order_id);

CREATE OR REPLACE FUNCTION handle_failed_delivery(p_order_id uuid, p_reason text DEFAULT 'Delivery failed')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE; v_sub subscriptions%ROWTYPE; v_failures integer; v_retry_id uuid; v_next_date date;
BEGIN
  SELECT * INTO v_order FROM orders WHERE id=p_order_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Order not found'); END IF;
  SELECT * INTO v_sub FROM subscriptions WHERE id=v_order.subscription_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'error','Subscription not found'); END IF;
  INSERT INTO delivery_failure_tracking(subscription_id,address_id,consecutive_failures,last_failure_date,last_failure_reason)
  VALUES(v_sub.id,v_sub.delivery_address_id,1,CURRENT_DATE,p_reason)
  ON CONFLICT(subscription_id) DO UPDATE SET consecutive_failures=delivery_failure_tracking.consecutive_failures+1,last_failure_date=CURRENT_DATE,last_failure_reason=p_reason,updated_at=now()
  RETURNING consecutive_failures INTO v_failures;
  UPDATE subscriptions SET consecutive_failures=v_failures WHERE id=v_sub.id;
  IF v_failures >= 3 AND v_sub.status='active' THEN
    UPDATE subscriptions SET status='paused' WHERE id=v_sub.id;
    UPDATE delivery_failure_tracking SET auto_paused=true,auto_paused_at=now() WHERE subscription_id=v_sub.id;
    RETURN jsonb_build_object('success',true,'auto_paused',true,'consecutive_failures',v_failures);
  END IF;
  IF v_sub.status='active' THEN
    v_next_date := CASE WHEN v_sub.next_delivery_date IS NOT NULL AND v_sub.next_delivery_date > CURRENT_DATE THEN v_sub.next_delivery_date ELSE CURRENT_DATE + CASE (SELECT frequency FROM subscription_plans WHERE id=v_sub.plan_id) WHEN 'daily' THEN 1 WHEN 'weekly' THEN 7 WHEN 'biweekly' THEN 14 WHEN 'monthly' THEN 30 ELSE 1 END END;
    INSERT INTO orders(subscription_id,user_id,scheduled_date,status,retry_of_order_id) VALUES(v_order.subscription_id,v_order.user_id,v_next_date,'scheduled',p_order_id) RETURNING id INTO v_retry_id;
  END IF;
  RETURN jsonb_build_object('success',true,'retry_order_id',v_retry_id,'next_delivery_date',v_next_date,'consecutive_failures',v_failures);
END;
$$;
REVOKE ALL ON FUNCTION handle_failed_delivery(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION handle_failed_delivery(uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION auto_expire_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_count integer; BEGIN UPDATE subscriptions SET status='cancelled' WHERE status IN ('active','renewed') AND end_date IS NOT NULL AND end_date < CURRENT_DATE; GET DIAGNOSTICS v_count=ROW_COUNT; INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('auto_expire_subscriptions',CURRENT_DATE,jsonb_build_object('expired',v_count)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary; RETURN jsonb_build_object('expired',v_count); END; $$;
REVOKE ALL ON FUNCTION auto_expire_subscriptions() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION auto_expire_subscriptions() TO service_role;

CREATE OR REPLACE FUNCTION auto_resume_paused_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_count integer; BEGIN UPDATE subscriptions SET status='active',consecutive_failures=0 WHERE status='paused' AND pause_until IS NOT NULL AND pause_until < CURRENT_DATE; GET DIAGNOSTICS v_count=ROW_COUNT; UPDATE delivery_failure_tracking SET auto_paused=false,consecutive_failures=0 WHERE subscription_id IN (SELECT id FROM subscriptions WHERE status='active'); INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('auto_resume_paused_subscriptions',CURRENT_DATE,jsonb_build_object('resumed',v_count)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary; RETURN jsonb_build_object('resumed',v_count); END; $$;
REVOKE ALL ON FUNCTION auto_resume_paused_subscriptions() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION auto_resume_paused_subscriptions() TO service_role;

CREATE OR REPLACE FUNCTION auto_cancel_pending_subscriptions()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_count integer; BEGIN UPDATE subscriptions SET status='cancelled' WHERE status='pending' AND created_at < now()-interval '7 days'; GET DIAGNOSTICS v_count=ROW_COUNT; INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('auto_cancel_pending_subscriptions',CURRENT_DATE,jsonb_build_object('cancelled',v_count)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary; RETURN jsonb_build_object('cancelled',v_count); END; $$;
REVOKE ALL ON FUNCTION auto_cancel_pending_subscriptions() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION auto_cancel_pending_subscriptions() TO service_role;

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
  RETURN jsonb_build_object('assigned',v_assigned,'failed',v_failed);
END; $$;
REVOKE ALL ON FUNCTION retry_unassigned_relaxed(date) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION retry_unassigned_relaxed(date) TO service_role;

CREATE OR REPLACE FUNCTION auto_generate_vendor_payments()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_po record; v_total numeric; v_count integer:=0;
BEGIN
  FOR v_po IN SELECT po.id,po.vendor_id FROM procurement_orders po WHERE po.status='fulfilled' AND NOT EXISTS(SELECT 1 FROM vendor_payments_auto v WHERE v.procurement_order_id=po.id) LOOP
    SELECT COALESCE(sum(total_price),0) INTO v_total FROM procurement_order_items WHERE procurement_order_id=v_po.id;
    INSERT INTO vendor_payments_auto(vendor_id,procurement_order_id,amount) VALUES(v_po.vendor_id,v_po.id,v_total) ON CONFLICT(procurement_order_id) DO NOTHING;
    v_count:=v_count+1;
  END LOOP;
  INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('auto_generate_vendor_payments',CURRENT_DATE,jsonb_build_object('created',v_count)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary;
  RETURN jsonb_build_object('created',v_count);
END; $$;
REVOKE ALL ON FUNCTION auto_generate_vendor_payments() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION auto_generate_vendor_payments() TO service_role;

CREATE OR REPLACE FUNCTION run_daily_health_check()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$ DECLARE v_total integer; v_unassigned integer; v_delivered integer; v_failed integer; v_riders integer; v_active integer; v_alerts jsonb:='[]'::jsonb;
BEGIN
  SELECT count(*) INTO v_total FROM orders WHERE scheduled_date=CURRENT_DATE; SELECT count(*) INTO v_unassigned FROM orders WHERE scheduled_date=CURRENT_DATE AND status='scheduled'; SELECT count(*) INTO v_delivered FROM orders WHERE scheduled_date=CURRENT_DATE AND status='delivered'; SELECT count(*) INTO v_failed FROM orders WHERE scheduled_date=CURRENT_DATE AND status='failed'; SELECT count(*) INTO v_riders FROM riders; SELECT count(*) INTO v_active FROM riders WHERE is_active=true;
  IF v_unassigned>0 THEN v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object('severity','critical','message',v_unassigned||' orders remain unassigned')); END IF;
  IF v_failed>0 THEN v_alerts:=v_alerts||jsonb_build_array(jsonb_build_object('severity','warning','message',v_failed||' deliveries failed')); END IF;
  INSERT INTO daily_ops_summary(summary_date,total_orders,unassigned_orders,delivered_orders,failed_orders,total_riders,active_riders,alerts) VALUES(CURRENT_DATE,v_total,v_unassigned,v_delivered,v_failed,v_riders,v_active,v_alerts) ON CONFLICT(summary_date) DO UPDATE SET total_orders=EXCLUDED.total_orders,unassigned_orders=EXCLUDED.unassigned_orders,delivered_orders=EXCLUDED.delivered_orders,failed_orders=EXCLUDED.failed_orders,total_riders=EXCLUDED.total_riders,active_riders=EXCLUDED.active_riders,alerts=EXCLUDED.alerts;
  INSERT INTO automation_run_logs(automation_name,run_date,summary) VALUES('run_daily_health_check',CURRENT_DATE,jsonb_build_object('alerts',v_alerts)) ON CONFLICT(automation_name,run_date) DO UPDATE SET summary=EXCLUDED.summary;
  RETURN jsonb_build_object('date',CURRENT_DATE,'total_orders',v_total,'unassigned',v_unassigned,'delivered',v_delivered,'failed',v_failed,'alerts',v_alerts);
END; $$;
REVOKE ALL ON FUNCTION run_daily_health_check() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION run_daily_health_check() TO service_role;

SELECT cron.schedule('auto-expire-subscriptions','30 18 * * *',$$SELECT auto_expire_subscriptions()$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-expire-subscriptions');
SELECT cron.schedule('auto-resume-paused-subscriptions','31 18 * * *',$$SELECT auto_resume_paused_subscriptions()$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-resume-paused-subscriptions');
SELECT cron.schedule('auto-cancel-pending-subscriptions','32 18 * * *',$$SELECT auto_cancel_pending_subscriptions()$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-cancel-pending-subscriptions');
SELECT cron.schedule('retry-unassigned-relaxed','0 19 * * *',$$SELECT retry_unassigned_relaxed(CURRENT_DATE)$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='retry-unassigned-relaxed');
SELECT cron.schedule('auto-generate-vendor-payments','0 2 * * *',$$SELECT auto_generate_vendor_payments()$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='auto-generate-vendor-payments');
SELECT cron.schedule('daily-health-check','30 1 * * *',$$SELECT run_daily_health_check()$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='daily-health-check');

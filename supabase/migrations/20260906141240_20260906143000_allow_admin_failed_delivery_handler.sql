/*
  # Allow authorized admins to invoke failed-delivery automation

  1. Security
  - Keeps the function protected from anonymous users.
  - Allows authenticated users only when their profile has the admin role.
  - Keeps service-role cron execution available.
*/

CREATE OR REPLACE FUNCTION handle_failed_delivery(p_order_id uuid, p_reason text DEFAULT 'Delivery failed')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order orders%ROWTYPE; v_sub subscriptions%ROWTYPE; v_failures integer; v_retry_id uuid; v_next_date date;
BEGIN
  IF auth.role() = 'authenticated' AND NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN jsonb_build_object('success',false,'error','Not authorized');
  END IF;
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
REVOKE ALL ON FUNCTION handle_failed_delivery(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION handle_failed_delivery(uuid,text) TO authenticated, service_role;

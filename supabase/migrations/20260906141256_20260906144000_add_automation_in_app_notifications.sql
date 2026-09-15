/*
  # Add automatic in-app operational notifications

  1. Rider alerts
  - Notifies each rider after midnight assignment with their assignment count.

  2. Customer alerts
  - Notifies customers whose next-day subscription order has been assigned and is ready for delivery.

  3. Reliability
  - Both jobs are idempotent for each user, order, and delivery date.
  - Jobs run after the midnight assignment job.
*/

CREATE OR REPLACE FUNCTION notify_rider_assignments_in_app(p_target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rider record; v_count integer:=0; v_orders integer;
BEGIN
  FOR v_rider IN SELECT DISTINCT r.id,r.profile_id FROM riders r JOIN rider_order_assignments a ON a.rider_id=r.id WHERE a.status='assigned' AND a.auto_assigned=true AND a.assigned_at::date >= p_target_date AND a.assigned_at::date < p_target_date+1 AND r.profile_id IS NOT NULL LOOP
    SELECT count(*) INTO v_orders FROM rider_order_assignments WHERE rider_id=v_rider.id AND status='assigned' AND assigned_at::date >= p_target_date AND assigned_at::date < p_target_date+1;
    INSERT INTO in_app_notifications(user_id,title,body,event_type,is_read)
    SELECT v_rider.profile_id,'New delivery assignments','You have '||v_orders||' delivery assignments for '||to_char(p_target_date,'DD Mon')||'.','rider_assignment',false
    WHERE NOT EXISTS (SELECT 1 FROM in_app_notifications WHERE user_id=v_rider.profile_id AND event_type='rider_assignment' AND created_at::date=CURRENT_DATE AND body LIKE 'You have '||v_orders||' delivery assignments%');
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('notified_riders',v_count);
END; $$;
REVOKE ALL ON FUNCTION notify_rider_assignments_in_app(date) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION notify_rider_assignments_in_app(date) TO service_role;

CREATE OR REPLACE FUNCTION notify_customer_dispatch_in_app(p_target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_order record; v_count integer:=0;
BEGIN
  FOR v_order IN SELECT o.id,o.user_id FROM orders o WHERE o.scheduled_date=p_target_date AND o.status IN('out_for_delivery','scheduled') LOOP
    INSERT INTO in_app_notifications(user_id,title,body,event_type,is_read,related_order_id)
    SELECT v_order.user_id,'Delivery scheduled','Your flower delivery is scheduled for '||to_char(p_target_date,'DD Mon')||'.','order_dispatched',false,v_order.id
    WHERE NOT EXISTS (SELECT 1 FROM in_app_notifications WHERE related_order_id=v_order.id AND event_type='order_dispatched');
    v_count:=v_count+1;
  END LOOP;
  RETURN jsonb_build_object('notified_customers',v_count);
END; $$;
REVOKE ALL ON FUNCTION notify_customer_dispatch_in_app(date) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION notify_customer_dispatch_in_app(date) TO service_role;

SELECT cron.schedule('notify-rider-assignments-in-app','40 18 * * *',$$SELECT notify_rider_assignments_in_app(CURRENT_DATE + 1)$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='notify-rider-assignments-in-app');
SELECT cron.schedule('notify-customer-dispatch-in-app','45 18 * * *',$$SELECT notify_customer_dispatch_in_app(CURRENT_DATE + 1)$$) WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname='notify-customer-dispatch-in-app');

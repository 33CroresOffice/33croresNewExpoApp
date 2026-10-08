/*
# Fix admin cancellation for legacy pending subscription payments

1. Purpose
- Updates the admin cancellation action to support existing pending payment records that do not have a subscription_id.

2. Eligibility
- The caller must be an administrator.
- The subscription must be pending or active.
- A pending payment must belong to the same customer and match the selected subscription plan amount.

3. Audit and safety
- Keeps customer and admin activity logging.
- Does not delete payments or delivery orders.
- Keeps execution restricted to authenticated administrators.
*/

CREATE OR REPLACE FUNCTION public.admin_cancel_unpaid_subscription_order(p_subscription_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription subscriptions%ROWTYPE;
  v_actor profiles%ROWTYPE;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  SELECT s.* INTO v_subscription
  FROM subscriptions s
  JOIN subscription_plans sp ON sp.id = s.plan_id
  WHERE s.id = p_subscription_id
    AND s.status IN ('pending', 'active')
    AND EXISTS (
      SELECT 1
      FROM payments p
      WHERE p.user_id = s.user_id
        AND p.status = 'pending'
        AND p.amount = sp.price
    )
  FOR UPDATE;

  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION 'Subscription is not an eligible unpaid order';
  END IF;

  SELECT * INTO v_actor FROM profiles WHERE id = auth.uid();

  UPDATE subscriptions SET status = 'cancelled' WHERE id = v_subscription.id;

  INSERT INTO customer_activity_log (customer_id, actor_id, activity_type, description, metadata)
  VALUES (
    v_subscription.user_id,
    auth.uid(),
    'subscription_cancelled',
    'Subscription order cancelled by an administrator because payment was pending.',
    jsonb_build_object('subscription_id', v_subscription.id, 'reason', 'admin_cancelled_unpaid_order')
  );

  INSERT INTO admin_activity_log (actor_id, actor_name, actor_role, action, entity_type, entity_id, description, metadata)
  VALUES (
    auth.uid(),
    v_actor.full_name,
    COALESCE(v_actor.admin_role::text, v_actor.role::text),
    'cancel_unpaid_subscription_order',
    'subscription',
    v_subscription.id::text,
    'Cancelled an unpaid subscription order.',
    jsonb_build_object('subscription_id', v_subscription.id, 'customer_id', v_subscription.user_id, 'reason', 'admin_cancelled_unpaid_order')
  );

  RETURN jsonb_build_object('success', true, 'subscription_id', v_subscription.id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_cancel_unpaid_subscription_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_cancel_unpaid_subscription_order(uuid) TO authenticated;

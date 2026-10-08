/*
# Add secure admin cancellation for unpaid subscription orders

1. Purpose
- Adds a server-side action for administrators to cancel an unpaid subscription order from the Unpaid Orders screen.
- Restricts cancellation to subscriptions that are currently pending or active and have a pending payment record.

2. Modified behavior
- The subscription status is changed to `cancelled` only after the server re-checks the current status and payment state.
- Existing delivery orders are not deleted or changed.

3. Audit records
- Adds a customer activity entry identifying the subscription cancellation.
- Adds an immutable admin activity entry identifying the administrator and subscription.

4. Security
- The function runs with elevated database privileges but authorizes the caller with `is_admin()` and `auth.uid()`.
- Anonymous and regular authenticated users cannot execute the function.

5. Safety notes
- The function is idempotent for already-cancelled or otherwise ineligible subscriptions and returns a clear error instead of changing them.
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

  SELECT * INTO v_subscription
  FROM subscriptions
  WHERE id = p_subscription_id
    AND status IN ('pending', 'active')
    AND EXISTS (
      SELECT 1
      FROM payments
      WHERE payments.subscription_id = subscriptions.id
        AND payments.status = 'pending'
    )
  FOR UPDATE;

  IF v_subscription.id IS NULL THEN
    RAISE EXCEPTION 'Subscription is not an eligible unpaid order';
  END IF;

  SELECT * INTO v_actor
  FROM profiles
  WHERE id = auth.uid();

  UPDATE subscriptions
  SET status = 'cancelled'
  WHERE id = v_subscription.id
    AND status IN ('pending', 'active');

  INSERT INTO customer_activity_log (
    customer_id,
    actor_id,
    activity_type,
    description,
    metadata
  ) VALUES (
    v_subscription.user_id,
    auth.uid(),
    'subscription_cancelled',
    'Subscription order cancelled by an administrator because payment was pending.',
    jsonb_build_object('subscription_id', v_subscription.id, 'reason', 'admin_cancelled_unpaid_order')
  );

  INSERT INTO admin_activity_log (
    actor_id,
    actor_name,
    actor_role,
    action,
    entity_type,
    entity_id,
    description,
    metadata
  ) VALUES (
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

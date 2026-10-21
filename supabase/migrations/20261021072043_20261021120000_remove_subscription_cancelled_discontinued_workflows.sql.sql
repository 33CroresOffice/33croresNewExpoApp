/*
# Remove cancelled and discontinued subscription workflows

1. Purpose
- Removes cancelled/discontinued subscription statuses from the live subscription workflow.
- Keeps the existing subscription, payment, customer, delivery, and audit rows intact.

2. Data preservation
- Existing subscriptions currently marked `cancelled` or `renewed` are retained and reclassified as `expired`, which is one of the supported subscription statuses.
- No subscription, payment, order, customer, or delivery rows are deleted.

3. Subscription statuses
- The subscriptions status constraint now permits only `active`, `paused`, `expired`, `pending`, and `scheduled_pause`.
- Pause history remains unchanged so scheduled, active, resumed, and completed pause records are preserved.

4. Backend automation
- The expiry automation continues running and now writes `expired` instead of `cancelled`.
- Removes the pending-subscription cancellation cron job and its database function.
- Removes the administrator-only unpaid-order cancellation function.

5. Scope
- Cancellation workflows for custom orders, CRM tasks, procurement, provider bookings, and pause-history entries are not modified because they are separate business concepts.
*/

UPDATE public.subscriptions
SET status = 'expired'
WHERE status IN ('cancelled', 'renewed');

ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_status_check;

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('active', 'paused', 'expired', 'pending', 'scheduled_pause'));

CREATE OR REPLACE FUNCTION public.auto_expire_subscriptions()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_date date := CURRENT_DATE + 1;
BEGIN
  UPDATE public.subscriptions
  SET status = 'expired'
  WHERE status = 'active'
    AND end_date IS NOT NULL
    AND end_date < v_date;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.automation_run_logs (automation_name, run_date, summary)
  VALUES (
    'auto_expire_subscriptions',
    v_date,
    jsonb_build_object('expired', v_count)
  )
  ON CONFLICT (automation_name, run_date)
  DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('expired', v_count, 'date', v_date);
END;
$$;

REVOKE ALL ON FUNCTION public.auto_expire_subscriptions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_expire_subscriptions() TO service_role;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'auto-cancel-pending-subscriptions';
END;
$$;

DROP FUNCTION IF EXISTS public.auto_cancel_pending_subscriptions();
DROP FUNCTION IF EXISTS public.admin_cancel_unpaid_subscription_order(uuid);
/*
# Automatically carry a customer's previous rider to new subscriptions

## Summary
When a customer renews in the Customer App or an Admin creates a replacement
subscription, the new subscription now inherits the rider assigned to the
customer's most recent earlier subscription.

## 1. Data behavior
- No tables, columns, or existing records are removed or changed.
- A new subscription keeps any explicitly supplied `primary_rider_id`.
- Otherwise, the function first checks the subscription referenced by
  `renewed_from_subscription_id`.
- If that link is absent or has no primary rider, it checks the customer's most
  recent earlier subscription and then its latest non-reassigned order
  assignment.
- The inherited rider is written to `subscriptions.primary_rider_id`, allowing
  the normal order-assignment system to use the same rider for the new
  subscription.

## 2. Trigger
- Adds an AFTER INSERT trigger on `subscriptions`.
- The behavior applies to both active and pending subscriptions so a scheduled
  renewal retains its rider when it becomes active.
- The trigger is idempotent: it only fills an empty `primary_rider_id` and does
  not overwrite a deliberate assignment.

## 3. Security
- The trigger function runs as `SECURITY DEFINER` with a fixed `search_path`.
- Direct execution is revoked from PUBLIC, anon, and authenticated roles.
- The function is used internally by the database trigger and does not expose a
  new client-callable operation.

## 4. Important notes
1. The original subscription and its assignments remain unchanged.
2. If no earlier rider can be found, the new subscription remains unassigned
   and existing rider assignment automation continues to handle it.
3. Existing Customer App renewal logic remains compatible; the database rule
   provides the same behavior for Admin-created subscriptions as well.
*/

CREATE OR REPLACE FUNCTION public.carry_forward_subscription_rider()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rider_id uuid;
BEGIN
  IF NEW.primary_rider_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.primary_rider_id
  INTO v_rider_id
  FROM subscriptions s
  WHERE s.user_id = NEW.user_id
    AND s.id <> NEW.id
    AND s.primary_rider_id IS NOT NULL
  ORDER BY
    (s.id = NEW.renewed_from_subscription_id) DESC,
    COALESCE(s.new_end_date, s.end_date) DESC NULLS LAST,
    s.created_at DESC
  LIMIT 1;

  IF v_rider_id IS NULL THEN
    SELECT roa.rider_id
    INTO v_rider_id
    FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    JOIN subscriptions s ON s.id = o.subscription_id
    WHERE s.user_id = NEW.user_id
      AND s.id <> NEW.id
      AND roa.status <> 'reassigned'
    ORDER BY
      (s.id = NEW.renewed_from_subscription_id) DESC,
      roa.assigned_at DESC
    LIMIT 1;
  END IF;

  IF v_rider_id IS NOT NULL THEN
    UPDATE subscriptions
    SET primary_rider_id = v_rider_id
    WHERE id = NEW.id
      AND primary_rider_id IS NULL;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS carry_forward_subscription_rider_on_insert ON public.subscriptions;
CREATE TRIGGER carry_forward_subscription_rider_on_insert
AFTER INSERT ON public.subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.carry_forward_subscription_rider();

REVOKE EXECUTE ON FUNCTION public.carry_forward_subscription_rider() FROM PUBLIC, anon, authenticated;

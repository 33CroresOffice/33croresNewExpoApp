/*
# Carry forward previous rider when an existing subscription becomes active

## Summary
Fixes the gap where a subscription created before the auto carry-forward rule
existed (or created while unassigned) kept `primary_rider_id` empty forever,
so its orders showed "No rider assigned yet" even though the customer had a
previous rider.

## 1. Modified behavior
- The carry-forward rule now also runs when an existing subscription is
  updated (for example when a pending subscription becomes active), not only
  when it is first created.
- It only fills an empty `primary_rider_id`; explicit assignments are never
  overwritten.
- It only applies to pending, active, or renewed subscriptions, so expired or
  closed subscriptions are not touched.
- Filling the rider automatically feeds the existing order-assignment rule,
  which then assigns that rider to the subscription's unassigned orders.

## 2. Existing data protection
- No rows are deleted and no columns are dropped.
- A one-time backfill fills `primary_rider_id` only for subscriptions that are
  pending, active, or renewed, currently have no rider, and whose customer has
  an earlier subscription or delivery assignment that identifies a rider.
- The backfill's UPDATE triggers the existing assignment rule, which only
  creates assignments for orders that have no current (non-delivered, non-
  failed, non-reassigned) assignment. Completed, failed, and reassigned
  history remain untouched.

## 3. Security
- No new tables, columns, grants, or policies. The trigger function remains
  `SECURITY DEFINER` with a fixed `search_path`, and direct execution stays
  revoked from PUBLIC, anon, and authenticated roles.

## 4. Important notes
1. Safe to re-run: both the trigger recreation and the backfill are idempotent.
2. Subscriptions with no discoverable previous rider remain unassigned and
   continue to be handled by the existing auto-assignment process.
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
AFTER INSERT OR UPDATE OF status, primary_rider_id, user_id ON public.subscriptions
FOR EACH ROW
WHEN (NEW.primary_rider_id IS NULL AND NEW.status IN ('pending', 'active', 'renewed'))
EXECUTE FUNCTION public.carry_forward_subscription_rider();

DO $$
DECLARE
  v_sub record;
  v_rider_id uuid;
BEGIN
  FOR v_sub IN
    SELECT s.id, s.user_id, s.renewed_from_subscription_id
    FROM subscriptions s
    WHERE s.primary_rider_id IS NULL
      AND s.status IN ('pending', 'active', 'renewed')
  LOOP
    v_rider_id := NULL;

    SELECT s2.primary_rider_id
    INTO v_rider_id
    FROM subscriptions s2
    WHERE s2.user_id = v_sub.user_id
      AND s2.id <> v_sub.id
      AND s2.primary_rider_id IS NOT NULL
    ORDER BY
      (s2.id = v_sub.renewed_from_subscription_id) DESC,
      COALESCE(s2.new_end_date, s2.end_date) DESC NULLS LAST,
      s2.created_at DESC
    LIMIT 1;

    IF v_rider_id IS NULL THEN
      SELECT roa.rider_id
      INTO v_rider_id
      FROM rider_order_assignments roa
      JOIN orders o ON o.id = roa.order_id
      JOIN subscriptions s2 ON s2.id = o.subscription_id
      WHERE s2.user_id = v_sub.user_id
        AND s2.id <> v_sub.id
        AND roa.status <> 'reassigned'
      ORDER BY
        (s2.id = v_sub.renewed_from_subscription_id) DESC,
        roa.assigned_at DESC
      LIMIT 1;
    END IF;

    IF v_rider_id IS NOT NULL THEN
      UPDATE subscriptions
      SET primary_rider_id = v_rider_id
      WHERE id = v_sub.id
        AND primary_rider_id IS NULL;
    END IF;
  END LOOP;
END $$;

REVOKE EXECUTE ON FUNCTION public.carry_forward_subscription_rider() FROM PUBLIC, anon, authenticated;
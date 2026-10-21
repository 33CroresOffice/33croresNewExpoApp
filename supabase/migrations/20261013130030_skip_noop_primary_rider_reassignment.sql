/*
# Skip no-op reassignment churn in set_subscription_primary_rider

1. Purpose
- When an admin re-selected the SAME rider as primary, the function rewrote
  every future assignment row into a reassigned + new pair, polluting rider
  history with fake "reassignment" records. Now it only rewrites rows that
  actually belong to a different rider.
- Delivered/failed records were never touched (unchanged), so delivery history
  remains preserved.

2. Change
- The future-assignment rewrite loop now skips rows whose rider is already
  the target rider (`roa.rider_id IS DISTINCT FROM p_rider_id`).

3. Security
- No privilege changes; same admin-only SECURITY DEFINER function.
*/

CREATE OR REPLACE FUNCTION public.set_subscription_primary_rider(p_subscription_id uuid, p_rider_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
v_is_admin boolean;
v_rider_exists boolean;
v_previous_rider_id uuid;
v_reassigned_count integer := 0;
v_assignment RECORD;
BEGIN
SELECT EXISTS(
SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
) INTO v_is_admin;

IF NOT v_is_admin THEN
RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
END IF;

SELECT EXISTS(SELECT 1 FROM riders WHERE id = p_rider_id) INTO v_rider_exists;
IF NOT v_rider_exists THEN
RETURN jsonb_build_object('success', false, 'error', 'Rider not found');
END IF;

SELECT primary_rider_id INTO v_previous_rider_id
FROM subscriptions
WHERE id = p_subscription_id;

IF v_previous_rider_id IS DISTINCT FROM p_rider_id THEN
INSERT INTO subscription_rider_history
(subscription_id, previous_rider_id, new_rider_id, changed_by, reason)
VALUES
(p_subscription_id, v_previous_rider_id, p_rider_id, auth.uid(),
'Primary rider changed by admin');
END IF;

UPDATE subscriptions
SET primary_rider_id = p_rider_id
WHERE id = p_subscription_id;

FOR v_assignment IN
SELECT roa.id, roa.order_id, roa.rider_id
FROM rider_order_assignments roa
JOIN orders o ON o.id = roa.order_id
WHERE o.subscription_id = p_subscription_id
AND o.scheduled_date >= CURRENT_DATE
AND roa.status IN ('assigned', 'accepted')
AND roa.rider_id IS DISTINCT FROM p_rider_id
LOOP
UPDATE rider_order_assignments
SET status = 'reassigned', is_reassigned = true,
swap_reason = 'Primary rider changed by admin',
swapped_from_rider_id = v_assignment.rider_id,
updated_at = now()
WHERE id = v_assignment.id;

INSERT INTO rider_order_assignments (rider_id, order_id, status, notes, auto_assigned)
VALUES (p_rider_id, v_assignment.order_id, 'assigned',
'Assigned to new primary rider', false);
v_reassigned_count := v_reassigned_count + 1;
END LOOP;

RETURN jsonb_build_object(
'success', true,
'subscription_id', p_subscription_id,
'primary_rider_id', p_rider_id,
'previous_rider_id', v_previous_rider_id,
'future_orders_reassigned', v_reassigned_count
);
END;
$function$;

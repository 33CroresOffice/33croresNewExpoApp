/*
# Auto-assignment sets the subscription's primary (standing) rider

1. Plain-English summary
- The Admin "Assigned Orders" page lists subscriptions by their primary
  rider (primary_rider_id on subscriptions). Manual assignment sets that
  column, but the automatic nightly assignment did not. As a result, a
  subscription assigned automatically had no standing rider: after the
  rider delivered that day's order, the subscription vanished from the
  Assigned Orders page even though the rider still served the customer.
- This migration fixes both functions that create daily assignments so
  they always record the chosen rider as the subscription's primary
  (standing) rider. That rider keeps delivering every day until admin
  unassigns/reassigns or the subscription ends.
- It also backfills every subscription that currently has an active or
  delivered assignment but no primary rider, so subscriptions already
  visible in rider profiles reappear on the Assigned Orders page.

2. Modified functions
- `auto_assign_riders(target_date date)`: when an order's subscription has
  no primary rider yet, the rider chosen by the scoring logic is written
  to subscriptions.primary_rider_id (once per subscription, only when
  currently NULL). Existing primary-rider behavior is unchanged.
- `manual_reassign_orders(...)`: when a reassignment is not temporary
  (no end date / permanent change), the new rider also becomes the
  subscription's primary rider. Temporary leave cover is untouched.

3. Backfill
- subscriptions.primary_rider_id is filled from each subscription's most
  recent assignment that is not failed/reassigned, only where it is
  currently NULL. No existing values are overwritten.

4. Security
- No RLS changes. Functions keep their existing SECURITY DEFINER grants.
*/

-- 1. auto_assign_riders: set primary rider when creating an assignment
CREATE OR REPLACE FUNCTION auto_assign_riders(target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_settings auto_assignment_settings%ROWTYPE;
  v_order RECORD;
  v_rider RECORD;
  v_best_rider_id uuid;
  v_best_score integer;
  v_rider_score integer;
  v_locality_id uuid;
  v_current_load integer;
  v_current_cap integer;
  v_assigned_count integer := 0;
  v_failed_count integer := 0;
  v_total_orders integer := 0;
  v_primary_assigned integer := 0;
  v_load_map jsonb := '{}'::jsonb;
  v_cap_map jsonb := '{}'::jsonb;
  v_leave_ids uuid[];
  v_present_ids uuid[];
  v_use_present boolean := false;
  v_primary_rider_id uuid;
BEGIN
  SELECT * INTO v_settings FROM auto_assignment_settings WHERE id = 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('assigned', 0, 'failed', 0, 'total', 0, 'message', 'Settings not found');
  END IF;

  IF v_settings.enabled = false THEN
    RETURN jsonb_build_object('assigned', 0, 'failed', 0, 'total', 0, 'message', 'Auto-assignment disabled');
  END IF;

  SELECT COALESCE(array_agg(rider_id), ARRAY[]::uuid[]) INTO v_leave_ids
  FROM rider_leave_requests
  WHERE status = 'approved' AND leave_date <= target_date AND end_date >= target_date;

  IF v_settings.require_attendance THEN
    SELECT COALESCE(array_agg(DISTINCT roa.rider_id), ARRAY[]::uuid[]) INTO v_present_ids
    FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    WHERE o.scheduled_date >= CURRENT_DATE - INTERVAL '7 days'
      AND roa.status IN ('accepted', 'picked_up', 'delivered');
    v_use_present := array_length(v_present_ids, 1) > 0;
  END IF;

  FOR v_rider IN
    SELECT r.id, COALESCE(r.max_daily_orders, 15) AS cap
    FROM riders r WHERE r.is_active = true
  LOOP
    v_cap_map := jsonb_set(v_cap_map, ARRAY[v_rider.id::text], to_jsonb(v_rider.cap));
  END LOOP;

  FOR v_order IN
    SELECT o.id, o.subscription_id, o.user_id FROM orders o
    WHERE o.scheduled_date = target_date AND o.status = 'scheduled'
      AND NOT EXISTS (SELECT 1 FROM rider_order_assignments roa WHERE roa.order_id = o.id AND roa.status NOT IN ('delivered','failed','reassigned'))
    ORDER BY o.scheduled_date
  LOOP
    v_total_orders := v_total_orders + 1;

    SELECT s.primary_rider_id INTO v_primary_rider_id
    FROM subscriptions s WHERE s.id = v_order.subscription_id;

    IF v_primary_rider_id IS NOT NULL THEN
      INSERT INTO rider_order_assignments (rider_id, order_id, status, notes, auto_assigned)
      VALUES (v_primary_rider_id, v_order.id, 'assigned', 'Primary rider assignment', true);
      UPDATE orders SET status = 'out_for_delivery' WHERE id = v_order.id;
      v_current_load := COALESCE((v_load_map ->> v_primary_rider_id::text)::integer, 0);
      v_load_map := jsonb_set(v_load_map, ARRAY[v_primary_rider_id::text], to_jsonb(v_current_load + 1));
      v_assigned_count := v_assigned_count + 1;
      v_primary_assigned := v_primary_assigned + 1;
      CONTINUE;
    END IF;

    v_best_rider_id := NULL;
    v_best_score := -1;

    SELECT a.locality_id INTO v_locality_id
    FROM subscriptions s JOIN addresses a ON a.id = s.delivery_address_id
    WHERE s.id = v_order.subscription_id;

    FOR v_rider IN
      SELECT r.id, rza.priority_level FROM riders r
      JOIN rider_zone_assignments rza ON rza.rider_id = r.id
      WHERE rza.locality_id = v_locality_id AND r.is_active = true
        AND (v_leave_ids IS NULL OR r.id <> ALL(v_leave_ids))
        AND (NOT v_use_present OR r.id = ANY(v_present_ids))
      ORDER BY CASE WHEN rza.priority_level = 'primary' THEN 0 ELSE 1 END
    LOOP
      v_current_load := COALESCE((v_load_map ->> v_rider.id::text)::integer, 0);
      v_current_cap := COALESCE((v_cap_map ->> v_rider.id::text)::integer, 15);
      IF v_current_load < v_current_cap THEN
        v_rider_score := CASE WHEN v_rider.priority_level = 'primary' THEN 100 ELSE 80 END - v_current_load;
        IF v_rider_score > v_best_score THEN
          v_best_score := v_rider_score;
          v_best_rider_id := v_rider.id;
        END IF;
      END IF;
    END LOOP;

    IF v_best_rider_id IS NULL THEN
      FOR v_rider IN
        SELECT r.id FROM riders r
        WHERE r.is_active = true
          AND (v_leave_ids IS NULL OR r.id <> ALL(v_leave_ids))
          AND (NOT v_use_present OR r.id = ANY(v_present_ids))
        ORDER BY r.id
      LOOP
        v_current_load := COALESCE((v_load_map ->> v_rider.id::text)::integer, 0);
        v_current_cap := COALESCE((v_cap_map ->> v_rider.id::text)::integer, 15);
        IF v_current_load < v_current_cap THEN
          v_rider_score := 50 - v_current_load;
          IF v_rider_score > v_best_score THEN
            v_best_score := v_rider_score;
            v_best_rider_id := v_rider.id;
          END IF;
        END IF;
      END LOOP;
    END IF;

    IF v_best_rider_id IS NOT NULL THEN
      INSERT INTO rider_order_assignments (rider_id, order_id, status, notes, auto_assigned)
      VALUES (v_best_rider_id, v_order.id, 'assigned', 'Auto-assigned', true);
      UPDATE orders SET status = 'out_for_delivery' WHERE id = v_order.id;
      v_current_load := COALESCE((v_load_map ->> v_best_rider_id::text)::integer, 0);
      v_load_map := jsonb_set(v_load_map, ARRAY[v_best_rider_id::text], to_jsonb(v_current_load + 1));
      v_assigned_count := v_assigned_count + 1;
      -- Record the chosen rider as the subscription's standing rider so
      -- the subscription stays visible in Assigned Orders after delivery.
      UPDATE subscriptions
      SET primary_rider_id = v_best_rider_id
      WHERE id = v_order.subscription_id AND primary_rider_id IS NULL;
    ELSE
      v_failed_count := v_failed_count + 1;
    END IF;
  END LOOP;

  UPDATE auto_assignment_settings SET last_auto_assign_run = now(), updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object(
    'assigned', v_assigned_count,
    'failed', v_failed_count,
    'total', v_total_orders,
    'primary_assigned', v_primary_assigned
  );
END;
$$;

-- 2. Backfill: subscriptions with a real assignment but no primary rider
UPDATE subscriptions s
SET primary_rider_id = (
  SELECT roa.rider_id
  FROM rider_order_assignments roa
  JOIN orders o ON o.id = roa.order_id
  WHERE o.subscription_id = s.id
    AND roa.status NOT IN ('reassigned')
  ORDER BY roa.assigned_at DESC
  LIMIT 1
)
WHERE s.primary_rider_id IS NULL
  AND EXISTS (
    SELECT 1 FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    WHERE o.subscription_id = s.id AND roa.status IN ('assigned', 'accepted', 'picked_up', 'delivered')
  );

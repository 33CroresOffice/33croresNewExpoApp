/*
# Stable Primary Rider Assignment for Subscriptions

## Overview
Implements a stable "primary rider" model for subscription deliveries:
- Each subscription stores one primary_rider_id that stays fixed for the
  subscription's lifetime unless Admin explicitly changes it.
- Auto-assignment, fallback, no-show, leave-redistribution, and relaxed-retry
  functions all respect the primary rider: orders from subscriptions with a
  primary rider are always assigned to that rider, regardless of leave,
  absence, workload, or capacity.
- Redistribution cron jobs (no-show, nightly-leave, relaxed-retry) are
  disabled by default. Admin can re-enable them through Cron Management.
- Manual Reassign remains a temporary date-range override and never changes
  the subscription's primary rider.
- Customize Orders and completed delivery history are untouched.

## 1. Schema Changes
### subscriptions table (existing, no data touched)
- `primary_rider_id` (uuid, nullable, REFERENCES riders(id) ON DELETE SET NULL)
  The rider permanently assigned to this subscription's deliveries.

## 2. Backfill
For every active/renewed/paused subscription that does not yet have a
primary_rider_id, set it from the most recent non-reassigned assignment's
rider_id. Subscriptions with no assignment history are left NULL and will
get a primary rider through the normal initial assignment process.

## 3. Modified Functions (all SECURITY DEFINER)
### auto_assign_riders(target_date)
  - Orders whose subscription has a primary_rider_id are always assigned to
    that rider, ignoring leave, attendance, capacity, and zone hierarchy.
  - Orders without a primary rider use the existing zone/load logic.

### redistribute_planned_leave(target_date)
  - Skips orders whose subscription has a primary_rider_id.
  - Only redistributes orders from subscriptions without a primary rider.

### redistribute_no_shows(target_date)
  - Skips orders whose subscription has a primary_rider_id.
  - Only redistributes orders from subscriptions without a primary rider.

### retry_unassigned_relaxed(p_target_date)
  - Orders with a primary_rider_id are assigned to that rider.
  - Orders without a primary rider use the existing least-loaded logic.

## 4. New Function
### set_subscription_primary_rider(p_subscription_id, p_rider_id)
  Admin-only RPC to explicitly set or change a subscription's primary rider.

## 5. Cron Job Changes
  - no-show-detection-615am -> disabled (active = false)
  - no-show-safety-pass-630am -> disabled (active = false)
  - nightly-leave-redistribution -> disabled (active = false)
  - retry-unassigned-relaxed -> disabled (active = false)
  - auto-assign-riders-daily -> stays enabled (respects primary rider)
  - restore-temporary-reassignments -> stays enabled (returns to primary rider)

## 6. Security
  - set_subscription_primary_rider checks profiles.role = 'admin' for auth.uid().
  - primary_rider_id column inherits existing subscriptions RLS policies.
*/

-- 1. Add primary_rider_id to subscriptions
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS primary_rider_id uuid REFERENCES riders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subscriptions_primary_rider_id
  ON subscriptions(primary_rider_id) WHERE primary_rider_id IS NOT NULL;

-- 2. Backfill primary_rider_id from most recent non-reassigned assignment
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
  AND s.status IN ('active', 'renewed', 'paused')
  AND EXISTS (
    SELECT 1 FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    WHERE o.subscription_id = s.id AND roa.status NOT IN ('reassigned')
  );

-- 3. Modified auto_assign_riders
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
  v_assigned_count integer := 0;
  v_failed_count integer := 0;
  v_total_orders integer := 0;
  v_total_available integer;
  v_total_capacity integer;
  v_total_unassigned integer;
  v_effective_cap integer;
  v_load_map jsonb := '{}'::jsonb;
  v_cap_map jsonb := '{}'::jsonb;
  v_leave_ids uuid[];
  v_present_ids uuid[];
  v_locality_id integer;
  v_current_load integer;
  v_current_cap integer;
  v_use_present boolean;
  v_k text;
  v_v text;
  v_primary_rider_id uuid;
  v_primary_assigned integer := 0;
BEGIN
  SELECT * INTO v_settings FROM auto_assignment_settings WHERE id = 1;
  IF NOT v_settings.auto_assign_enabled THEN
    RETURN jsonb_build_object('enabled', false, 'message', 'Auto-assignment is disabled');
  END IF;

  SELECT array_agg(rider_id) INTO v_leave_ids
  FROM rider_leave_requests
  WHERE status = 'approved'
    AND target_date BETWEEN leave_date AND COALESCE(end_date, leave_date);

  SELECT array_agg(rider_id) INTO v_present_ids
  FROM rider_attendance WHERE date = target_date AND status = 'present' AND check_in_time IS NOT NULL;

  SELECT count(*) INTO v_total_unassigned
  FROM orders o WHERE o.scheduled_date = target_date AND o.status = 'scheduled'
    AND NOT EXISTS (SELECT 1 FROM rider_order_assignments roa WHERE roa.order_id = o.id AND roa.status NOT IN ('delivered','failed','reassigned'));

  IF v_total_unassigned = 0 THEN
    RETURN jsonb_build_object('assigned', 0, 'failed', 0, 'message', 'No unassigned orders');
  END IF;

  v_use_present := v_present_ids IS NOT NULL AND array_length(v_present_ids, 1) > 0;

  FOR v_rider IN
    SELECT r.id, COALESCE(r.max_daily_deliveries, v_settings.default_max_daily_deliveries) as cap
    FROM riders r
    WHERE r.is_active = true
      AND (v_leave_ids IS NULL OR r.id <> ALL(v_leave_ids))
      AND (NOT v_use_present OR r.id = ANY(v_present_ids))
  LOOP
    v_cap_map := v_cap_map || jsonb_build_object(v_rider.id::text, v_rider.cap);
    v_load_map := v_load_map || jsonb_build_object(v_rider.id::text, 0);
  END LOOP;

  SELECT count(*) INTO v_total_available FROM jsonb_each(v_cap_map);
  SELECT sum((val)::integer) INTO v_total_capacity FROM jsonb_each_text(v_cap_map) AS t(val);

  IF v_total_capacity = 0 THEN
    RETURN jsonb_build_object('assigned', 0, 'failed', v_total_unassigned, 'message', 'No available riders');
  END IF;

  IF v_total_unassigned > v_total_capacity THEN
    FOR v_k, v_v IN SELECT key, value FROM jsonb_each(v_cap_map) LOOP
      v_effective_cap := CEIL((v_v)::integer * v_total_unassigned::numeric / GREATEST(v_total_capacity, 1));
      v_cap_map := jsonb_set(v_cap_map, ARRAY[v_k], to_jsonb(v_effective_cap));
    END LOOP;
  END IF;

  FOR v_rider IN
    SELECT roa.rider_id, count(*) as cnt FROM rider_order_assignments roa
    WHERE roa.status IN ('assigned','accepted','picked_up') AND DATE(roa.assigned_at) = target_date
    GROUP BY roa.rider_id
  LOOP
    IF v_load_map ? v_rider.rider_id::text THEN
      v_load_map := jsonb_set(v_load_map, ARRAY[v_rider.rider_id::text],
        to_jsonb(COALESCE((v_load_map ->> v_rider.rider_id::text)::integer, 0) + v_rider.cnt));
    END IF;
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
    ELSE
      v_failed_count := v_failed_count + 1;
    END IF;
  END LOOP;

  UPDATE auto_assignment_settings SET last_auto_assign_run = now(), updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('assigned', v_assigned_count, 'failed', v_failed_count,
    'total_orders', v_total_orders, 'available_riders', v_total_available,
    'shortage_mode', v_total_unassigned > v_total_capacity,
    'primary_rider_assigned', v_primary_assigned);
END;
$$;

-- 4. Modified redistribute_planned_leave
CREATE OR REPLACE FUNCTION redistribute_planned_leave(target_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings auto_assignment_settings%ROWTYPE;
  v_leave_rider RECORD;
  v_assignment RECORD;
  v_backup_id uuid;
  v_fallback_id uuid;
  v_redistributed integer := 0;
  v_failed integer := 0;
  v_skipped_primary integer := 0;
  v_leave_ids uuid[];
  v_locality_id integer;
  v_current_load integer;
  v_current_cap integer;
  v_load_map jsonb := '{}'::jsonb;
  v_cap_map jsonb := '{}'::jsonb;
  v_rider RECORD;
  v_has_primary boolean;
BEGIN
  SELECT * INTO v_settings FROM auto_assignment_settings WHERE id = 1;

  SELECT array_agg(rider_id) INTO v_leave_ids
  FROM rider_leave_requests
  WHERE status = 'approved'
    AND target_date BETWEEN leave_date AND COALESCE(end_date, leave_date);

  IF v_leave_ids IS NULL THEN
    RETURN jsonb_build_object('redistributed', 0, 'message', 'No riders on leave');
  END IF;

  FOR v_rider IN
    SELECT r.id, COALESCE(r.max_daily_deliveries, v_settings.default_max_daily_deliveries) AS cap
    FROM riders r WHERE r.is_active = true AND r.id <> ALL(v_leave_ids)
  LOOP
    v_cap_map := v_cap_map || jsonb_build_object(v_rider.id::text, v_rider.cap);
    v_load_map := v_load_map || jsonb_build_object(v_rider.id::text, 0);
  END LOOP;

  FOR v_rider IN
    SELECT roa.rider_id, count(*) AS cnt
    FROM rider_order_assignments roa
    JOIN orders o ON o.id = roa.order_id
    WHERE roa.status IN ('assigned','accepted','picked_up')
      AND o.scheduled_date = target_date
    GROUP BY roa.rider_id
  LOOP
    IF v_load_map ? v_rider.rider_id::text THEN
      v_load_map := jsonb_set(v_load_map, ARRAY[v_rider.rider_id::text],
        to_jsonb(COALESCE((v_load_map ->> v_rider.rider_id::text)::integer, 0) + v_rider.cnt));
    END IF;
  END LOOP;

  FOR v_leave_rider IN SELECT id FROM riders WHERE id = ANY(v_leave_ids) LOOP
    FOR v_assignment IN
      SELECT roa.id, roa.order_id
      FROM rider_order_assignments roa
      JOIN orders o ON o.id = roa.order_id
      WHERE roa.rider_id = v_leave_rider.id
        AND roa.status IN ('assigned','accepted','picked_up')
        AND o.scheduled_date = target_date
    LOOP
      SELECT EXISTS(
        SELECT 1 FROM subscriptions s
        JOIN orders o ON o.subscription_id = s.id
        WHERE o.id = v_assignment.order_id AND s.primary_rider_id IS NOT NULL
      ) INTO v_has_primary;

      IF v_has_primary THEN
        v_skipped_primary := v_skipped_primary + 1;
        CONTINUE;
      END IF;

      v_backup_id := NULL;
      v_fallback_id := NULL;

      SELECT a.locality_id INTO v_locality_id
      FROM orders o
      JOIN subscriptions s ON s.id = o.subscription_id
      JOIN addresses a ON a.id = s.delivery_address_id
      WHERE o.id = v_assignment.order_id;

      FOR v_rider IN
        SELECT r.id FROM riders r
        JOIN rider_zone_assignments rza ON rza.rider_id = r.id
        WHERE rza.locality_id = v_locality_id
          AND rza.priority_level = 'backup'
          AND r.is_active = true
          AND r.id <> ALL(v_leave_ids)
        ORDER BY r.id
      LOOP
        v_current_load := COALESCE((v_load_map ->> v_rider.id::text)::integer, 0);
        v_current_cap := COALESCE((v_cap_map ->> v_rider.id::text)::integer, 15);
        IF v_current_load < v_current_cap THEN
          v_backup_id := v_rider.id;
          EXIT;
        END IF;
      END LOOP;

      IF v_backup_id IS NULL THEN
        FOR v_rider IN
          SELECT r.id FROM riders r
          WHERE r.is_active = true AND r.id <> ALL(v_leave_ids)
          ORDER BY COALESCE((v_load_map ->> r.id::text)::integer, 0), r.id
        LOOP
          v_current_load := COALESCE((v_load_map ->> v_rider.id::text)::integer, 0);
          v_current_cap := COALESCE((v_cap_map ->> v_rider.id::text)::integer, 15);
          IF v_current_load < v_current_cap THEN
            v_fallback_id := v_rider.id;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      IF v_backup_id IS NOT NULL OR v_fallback_id IS NOT NULL THEN
        UPDATE rider_order_assignments
        SET status = 'reassigned', is_reassigned = true,
            swap_reason = 'Rider on planned leave',
            swapped_from_rider_id = v_leave_rider.id,
            updated_at = now()
        WHERE id = v_assignment.id;

        INSERT INTO rider_order_assignments
          (rider_id, order_id, status, auto_assigned, notes, swap_reason, swapped_from_rider_id)
        VALUES
          (COALESCE(v_backup_id, v_fallback_id), v_assignment.order_id, 'assigned', true,
           'Auto-reassigned: rider on planned leave', 'Rider on planned leave', v_leave_rider.id);

        v_current_load := COALESCE((v_load_map ->> COALESCE(v_backup_id, v_fallback_id)::text)::integer, 0);
        v_load_map := jsonb_set(v_load_map, ARRAY[COALESCE(v_backup_id, v_fallback_id)::text], to_jsonb(v_current_load + 1));
        v_redistributed := v_redistributed + 1;
      ELSE
        v_failed := v_failed + 1;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE auto_assignment_settings SET last_nightly_run = now(), updated_at = now() WHERE id = 1;
  RETURN jsonb_build_object('redistributed', v_redistributed, 'failed', v_failed,
    'skipped_primary', v_skipped_primary);
END;
$$;

-- 5. Modified redistribute_no_shows
CREATE OR REPLACE FUNCTION redistribute_no_shows(target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_settings auto_assignment_settings%ROWTYPE;
  v_no_show_rider RECORD;
  v_assignment RECORD;
  v_replacement_id uuid;
  v_redistributed integer := 0;
  v_failed integer := 0;
  v_no_show_count integer := 0;
  v_skipped_primary integer := 0;
  v_no_show_ids uuid[];
  v_leave_ids uuid[];
  v_present_ids uuid[];
  v_locality_id integer;
  v_current_load integer;
  v_current_cap integer;
  v_load_map jsonb := '{}'::jsonb;
  v_cap_map jsonb := '{}'::jsonb;
  v_rider RECORD;
  v_has_primary boolean;
BEGIN
  SELECT * INTO v_settings FROM auto_assignment_settings WHERE id = 1;

  SELECT array_agg(rider_id) INTO v_leave_ids
  FROM rider_leave_requests
  WHERE status = 'approved'
    AND target_date BETWEEN leave_date AND COALESCE(end_date, leave_date);

  SELECT array_agg(rider_id) INTO v_present_ids
  FROM rider_attendance WHERE date = target_date AND status = 'present' AND check_in_time IS NOT NULL;

  IF v_present_ids IS NULL THEN
    v_present_ids := ARRAY[]::uuid[];
  END IF;

  SELECT array_agg(DISTINCT rider_id) INTO v_no_show_ids
  FROM rider_order_assignments
  WHERE status IN ('assigned','accepted','picked_up') AND DATE(assigned_at) = target_date
    AND rider_id <> ALL(v_present_ids)
    AND (v_leave_ids IS NULL OR rider_id <> ALL(v_leave_ids));

  IF v_no_show_ids IS NULL THEN
    RETURN jsonb_build_object('no_shows', 0, 'redistributed', 0, 'message', 'No no-shows detected');
  END IF;

  v_no_show_count := array_length(v_no_show_ids, 1);

  FOR v_rider IN
    SELECT r.id, COALESCE(r.max_daily_deliveries, v_settings.default_max_daily_deliveries) as cap
    FROM riders r WHERE r.is_active = true AND r.id = ANY(v_present_ids)
      AND (v_leave_ids IS NULL OR r.id <> ALL(v_leave_ids))
  LOOP
    v_cap_map := v_cap_map || jsonb_build_object(v_rider.id::text, v_rider.cap);
    v_load_map := v_load_map || jsonb_build_object(v_rider.id::text, 0);
  END LOOP;

  FOR v_rider IN
    SELECT roa.rider_id, count(*) as cnt FROM rider_order_assignments roa
    WHERE roa.status IN ('assigned','accepted','picked_up') AND DATE(roa.assigned_at) = target_date
    GROUP BY roa.rider_id
  LOOP
    IF v_load_map ? v_rider.rider_id::text THEN
      v_load_map := jsonb_set(v_load_map, ARRAY[v_rider.rider_id::text],
        to_jsonb(COALESCE((v_load_map ->> v_rider.rider_id::text)::integer, 0) + v_rider.cnt));
    END IF;
  END LOOP;

  FOR v_no_show_rider IN SELECT id, full_name FROM riders WHERE id = ANY(v_no_show_ids) LOOP
    FOR v_assignment IN
      SELECT id, order_id FROM rider_order_assignments
      WHERE rider_id = v_no_show_rider.id AND status IN ('assigned','accepted','picked_up')
    LOOP
      SELECT EXISTS(
        SELECT 1 FROM subscriptions s
        JOIN orders o ON o.subscription_id = s.id
        WHERE o.id = v_assignment.order_id AND s.primary_rider_id IS NOT NULL
      ) INTO v_has_primary;

      IF v_has_primary THEN
        v_skipped_primary := v_skipped_primary + 1;
        CONTINUE;
      END IF;

      v_replacement_id := NULL;

      SELECT a.locality_id INTO v_locality_id
      FROM orders o JOIN subscriptions s ON s.id = o.subscription_id
      JOIN addresses a ON a.id = s.delivery_address_id WHERE o.id = v_assignment.order_id;

      FOR v_rider IN
        SELECT r.id FROM riders r
        JOIN rider_zone_assignments rza ON rza.rider_id = r.id
        WHERE rza.locality_id = v_locality_id AND rza.priority_level = 'backup'
          AND r.is_active = true AND r.id = ANY(v_present_ids)
          AND (v_leave_ids IS NULL OR r.id <> ALL(v_leave_ids))
        ORDER BY rza.priority_level
      LOOP
        v_current_load := COALESCE((v_load_map ->> v_rider.id::text)::integer, 0);
        v_current_cap := COALESCE((v_cap_map ->> v_rider.id::text)::integer, 15);
        IF v_current_load < v_current_cap THEN
          v_replacement_id := v_rider.id;
          EXIT;
        END IF;
      END LOOP;

      IF v_replacement_id IS NULL THEN
        FOR v_rider IN
          SELECT r.id FROM riders r WHERE r.is_active = true AND r.id = ANY(v_present_ids)
            AND (v_leave_ids IS NULL OR r.id <> ALL(v_leave_ids))
          ORDER BY COALESCE((v_load_map ->> r.id::text)::integer, 0) ASC
        LOOP
          v_current_load := COALESCE((v_load_map ->> v_rider.id::text)::integer, 0);
          v_current_cap := COALESCE((v_cap_map ->> v_rider.id::text)::integer, 15);
          IF v_current_load < v_current_cap THEN
            v_replacement_id := v_rider.id;
            EXIT;
          END IF;
        END LOOP;
      END IF;

      IF v_replacement_id IS NOT NULL THEN
        UPDATE rider_order_assignments SET status = 'reassigned', is_reassigned = true,
          swap_reason = 'Rider no-show at warehouse', swapped_from_rider_id = v_no_show_rider.id, updated_at = now()
        WHERE id = v_assignment.id;

        INSERT INTO rider_order_assignments (rider_id, order_id, status, auto_assigned, notes, swap_reason, swapped_from_rider_id)
        VALUES (v_replacement_id, v_assignment.order_id, 'assigned', true,
          'Auto-reassigned: rider no-show', 'Rider no-show at warehouse', v_no_show_rider.id);

        v_current_load := COALESCE((v_load_map ->> v_replacement_id::text)::integer, 0);
        v_load_map := jsonb_set(v_load_map, ARRAY[v_replacement_id::text], to_jsonb(v_current_load + 1));
        v_redistributed := v_redistributed + 1;
      ELSE
        v_failed := v_failed + 1;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE auto_assignment_settings SET last_no_show_run = now(), updated_at = now() WHERE id = 1;
  RETURN jsonb_build_object('no_shows', v_no_show_count, 'redistributed', v_redistributed,
    'failed', v_failed, 'skipped_primary', v_skipped_primary);
END;
$$;

-- 6. Modified retry_unassigned_relaxed
CREATE OR REPLACE FUNCTION retry_unassigned_relaxed(p_target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order orders%ROWTYPE;
  v_rider riders%ROWTYPE;
  v_best uuid;
  v_load integer;
  v_best_load integer;
  v_assigned integer := 0;
  v_failed integer := 0;
  v_primary_assigned integer := 0;
  v_primary_rider_id uuid;
BEGIN
  FOR v_order IN
    SELECT o.* FROM orders o
    WHERE o.scheduled_date = p_target_date
      AND o.status = 'scheduled'
      AND NOT EXISTS (
        SELECT 1 FROM rider_order_assignments a
        WHERE a.order_id = o.id AND a.status NOT IN ('delivered','failed','reassigned')
      )
  LOOP
    SELECT s.primary_rider_id INTO v_primary_rider_id
    FROM subscriptions s WHERE s.id = v_order.subscription_id;

    IF v_primary_rider_id IS NOT NULL THEN
      INSERT INTO rider_order_assignments (rider_id, order_id, status, notes, auto_assigned)
      VALUES (v_primary_rider_id, v_order.id, 'assigned', 'Primary rider assignment (relaxed)', true);
      UPDATE orders SET status = 'out_for_delivery' WHERE id = v_order.id;
      v_assigned := v_assigned + 1;
      v_primary_assigned := v_primary_assigned + 1;
      CONTINUE;
    END IF;

    v_best := NULL;
    v_best_load := 2147483647;

    FOR v_rider IN
      SELECT r.* FROM riders r WHERE r.is_active = true
    LOOP
      SELECT count(*) INTO v_load
      FROM rider_order_assignments a
      WHERE a.rider_id = v_rider.id
        AND a.status IN ('assigned','accepted','picked_up')
        AND a.assigned_at::date = p_target_date;
      IF v_load < v_best_load THEN
        v_best := v_rider.id;
        v_best_load := v_load;
      END IF;
    END LOOP;

    IF v_best IS NULL THEN
      v_failed := v_failed + 1;
    ELSE
      INSERT INTO rider_order_assignments (rider_id, order_id, status, notes, auto_assigned)
      VALUES (v_best, v_order.id, 'assigned', 'Auto-assigned in relaxed fallback mode', true);
      UPDATE orders SET status = 'out_for_delivery' WHERE id = v_order.id;
      v_assigned := v_assigned + 1;
    END IF;
  END LOOP;

  INSERT INTO automation_run_logs (automation_name, run_date, summary)
  VALUES ('retry_unassigned_relaxed', p_target_date,
    jsonb_build_object('assigned', v_assigned, 'failed', v_failed, 'primary_rider_assigned', v_primary_assigned))
  ON CONFLICT (automation_name, run_date) DO UPDATE SET summary = EXCLUDED.summary;

  RETURN jsonb_build_object('assigned', v_assigned, 'failed', v_failed,
    'primary_rider_assigned', v_primary_assigned, 'date', p_target_date);
END;
$$;

REVOKE ALL ON FUNCTION retry_unassigned_relaxed(date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION retry_unassigned_relaxed(date) TO service_role;

-- 7. New function: set_subscription_primary_rider
CREATE OR REPLACE FUNCTION set_subscription_primary_rider(
  p_subscription_id uuid,
  p_rider_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin boolean;
  v_rider_exists boolean;
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
    'future_orders_reassigned', v_reassigned_count
  );
END;
$$;

REVOKE ALL ON FUNCTION set_subscription_primary_rider(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_subscription_primary_rider(uuid, uuid) TO authenticated;

-- 8. Disable redistribution cron jobs by default
DO $$
DECLARE
  v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'no-show-detection-615am';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'no-show-safety-pass-630am';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'nightly-leave-redistribution';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;

  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'retry-unassigned-relaxed';
  IF v_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(job_id := v_jobid, active := false);
  END IF;
END $$;

-- 9. Update cron_job_definitions to reflect disabled state
UPDATE cron_job_definitions SET is_active = false
WHERE job_name IN (
  'no-show-detection-615am',
  'no-show-safety-pass-630am',
  'nightly-leave-redistribution',
  'retry-unassigned-relaxed'
);
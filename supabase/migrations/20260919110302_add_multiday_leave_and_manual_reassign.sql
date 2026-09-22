
-- ═══ 1. Add end_date column to rider_leave_requests ════════════════════════

ALTER TABLE rider_leave_requests
  ADD COLUMN IF NOT EXISTS end_date date;

-- Backfill: set end_date = leave_date for existing single-day records
UPDATE rider_leave_requests
  SET end_date = leave_date
  WHERE end_date IS NULL;

-- ═══ 2. Update redistribute_planned_leave to use date range ════════════════

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
  v_leave_ids uuid[];
  v_locality_id integer;
  v_current_load integer;
  v_current_cap integer;
  v_load_map jsonb := '{}'::jsonb;
  v_cap_map jsonb := '{}'::jsonb;
  v_rider RECORD;
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
  RETURN jsonb_build_object('redistributed', v_redistributed, 'failed', v_failed);
END;
$$;

-- ═══ 3. Update auto_assign_riders to use date range for leave exclusion ═══

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
    'shortage_mode', v_total_unassigned > v_total_capacity);
END;
$$;

-- ═══ 4. Update redistribute_no_shows to use date range for leave exclusion ═

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
  v_no_show_ids uuid[];
  v_leave_ids uuid[];
  v_present_ids uuid[];
  v_locality_id integer;
  v_current_load integer;
  v_current_cap integer;
  v_load_map jsonb := '{}'::jsonb;
  v_cap_map jsonb := '{}'::jsonb;
  v_rider RECORD;
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
  RETURN jsonb_build_object('no_shows', v_no_show_count, 'redistributed', v_redistributed, 'failed', v_failed);
END;
$$;

-- ═══ 5. manual_reassign_orders function ═════════════════════════════════════

CREATE OR REPLACE FUNCTION manual_reassign_orders(
  p_assignment_ids uuid[],
  p_new_rider_id uuid,
  p_reason text DEFAULT 'Manual reassignment'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment RECORD;
  v_reassigned_count integer := 0;
  v_failed_count integer := 0;
BEGIN
  FOR v_assignment IN
    SELECT id, rider_id, order_id, delivery_fee, distance_km, notes
    FROM rider_order_assignments
    WHERE id = ANY(p_assignment_ids)
      AND status IN ('assigned','accepted','picked_up')
  LOOP
    -- Mark old assignment as reassigned
    UPDATE rider_order_assignments
    SET status = 'reassigned',
        is_reassigned = true,
        swap_reason = p_reason,
        swapped_from_rider_id = v_assignment.rider_id,
        updated_at = now()
    WHERE id = v_assignment.id;

    -- Create new assignment for replacement rider
    INSERT INTO rider_order_assignments
      (rider_id, order_id, status, delivery_fee, distance_km, notes,
       swap_reason, swapped_from_rider_id, auto_assigned)
    VALUES
      (p_new_rider_id, v_assignment.order_id, 'assigned',
       v_assignment.delivery_fee, v_assignment.distance_km, v_assignment.notes,
       p_reason, v_assignment.rider_id, false);

    v_reassigned_count := v_reassigned_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'reassigned', v_reassigned_count,
    'failed', v_failed_count
  );
END;
$$;

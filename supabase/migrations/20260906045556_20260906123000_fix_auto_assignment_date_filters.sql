/* Keep automatic leave and no-show redistribution limited to the requested delivery date. */

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
  FROM rider_leave_requests WHERE leave_date = target_date AND status = 'approved';

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
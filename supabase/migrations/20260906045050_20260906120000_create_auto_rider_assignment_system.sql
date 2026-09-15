/*
  # Automatic Rider Assignment System

  ## Overview
  Creates a complete automatic rider assignment system that handles:
  - Zone-to-rider mapping with primary/backup hierarchy
  - Automatic assignment of riders to delivery orders
  - Planned leave redistribution (nightly)
  - No-show detection and emergency redistribution (6:15 AM)
  - Dynamic capacity scaling during rider shortages
  - Nearest-neighbor delivery route calculation

  ## New Tables
  1. `rider_zone_assignments` — links riders to localities with primary/backup priority
  2. `auto_assignment_settings` — single-row config (cutoff time, warehouse coords, caps, toggle)

  ## Modified Tables
  1. `riders` — added `max_daily_deliveries` (integer, default 15)
  2. `rider_order_assignments` — added `auto_assigned` (boolean, default false)

  ## New Functions (all SECURITY DEFINER)
  1. `auto_assign_riders(target_date)` — zone hierarchy + load balancing + capacity scaling
  2. `redistribute_planned_leave(target_date)` — reassigns orders from riders on approved leave
  3. `redistribute_no_shows(target_date)` — detects no-show riders, reassigns immediately
  4. `calculate_delivery_route(rider_id, target_date)` — nearest-neighbor route from warehouse

  ## Cron Jobs (IST -> UTC, IST = UTC+5:30)
  - 00:35 UTC (6:05 AM IST) — Auto-assign after order generation
  - 00:45 UTC (6:15 AM IST) — No-show detection
  - 01:00 UTC (6:30 AM IST) — No-show safety pass
  - 16:30 UTC (10:00 PM IST) — Nightly leave redistribution for next day
*/

-- ═══ 1. rider_zone_assignments ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rider_zone_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  locality_id integer NOT NULL REFERENCES localities(id) ON DELETE CASCADE,
  priority_level text NOT NULL DEFAULT 'primary' CHECK (priority_level IN ('primary', 'backup')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rider_id, locality_id)
);

ALTER TABLE rider_zone_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rza_rider_id ON rider_zone_assignments(rider_id);
CREATE INDEX IF NOT EXISTS idx_rza_locality_id ON rider_zone_assignments(locality_id);
CREATE INDEX IF NOT EXISTS idx_rza_priority ON rider_zone_assignments(priority_level);

DROP POLICY IF EXISTS "Admins can select rider_zone_assignments" ON rider_zone_assignments;
CREATE POLICY "Admins can select rider_zone_assignments"
  ON rider_zone_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert rider_zone_assignments" ON rider_zone_assignments;
CREATE POLICY "Admins can insert rider_zone_assignments"
  ON rider_zone_assignments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update rider_zone_assignments" ON rider_zone_assignments;
CREATE POLICY "Admins can update rider_zone_assignments"
  ON rider_zone_assignments FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can delete rider_zone_assignments" ON rider_zone_assignments;
CREATE POLICY "Admins can delete rider_zone_assignments"
  ON rider_zone_assignments FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ═══ 2. auto_assignment_settings ══════════════════════════════════════════

CREATE TABLE IF NOT EXISTS auto_assignment_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  auto_assign_enabled boolean NOT NULL DEFAULT true,
  no_show_cutoff_time text NOT NULL DEFAULT '06:15',
  warehouse_lat double precision,
  warehouse_lng double precision,
  default_max_daily_deliveries integer NOT NULL DEFAULT 15,
  nightly_redistribution_time text NOT NULL DEFAULT '22:00',
  last_nightly_run timestamptz,
  last_no_show_run timestamptz,
  last_auto_assign_run timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE auto_assignment_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select auto_assignment_settings" ON auto_assignment_settings;
CREATE POLICY "Admins can select auto_assignment_settings"
  ON auto_assignment_settings FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can insert auto_assignment_settings" ON auto_assignment_settings;
CREATE POLICY "Admins can insert auto_assignment_settings"
  ON auto_assignment_settings FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

DROP POLICY IF EXISTS "Admins can update auto_assignment_settings" ON auto_assignment_settings;
CREATE POLICY "Admins can update auto_assignment_settings"
  ON auto_assignment_settings FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

INSERT INTO auto_assignment_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- ═══ 3. Add max_daily_deliveries to riders ════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'riders' AND column_name = 'max_daily_deliveries') THEN
    ALTER TABLE riders ADD COLUMN max_daily_deliveries integer NOT NULL DEFAULT 15;
  END IF;
END $$;

-- ═══ 4. Add auto_assigned to rider_order_assignments ═════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rider_order_assignments' AND column_name = 'auto_assigned') THEN
    ALTER TABLE rider_order_assignments ADD COLUMN auto_assigned boolean DEFAULT false;
  END IF;
END $$;

-- ═══ 5. auto_assign_riders function ═══════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_assign_riders(target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  FROM rider_leave_requests WHERE leave_date = target_date AND status = 'approved';

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

-- ═══ 6. redistribute_planned_leave function ═══════════════════════════════

CREATE OR REPLACE FUNCTION redistribute_planned_leave(target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
    SELECT r.id, COALESCE(r.max_daily_deliveries, v_settings.default_max_daily_deliveries) as cap
    FROM riders r WHERE r.is_active = true AND r.id <> ALL(v_leave_ids)
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

  FOR v_leave_rider IN SELECT id FROM riders WHERE id = ANY(v_leave_ids) LOOP
    FOR v_assignment IN
      SELECT id, order_id FROM rider_order_assignments
      WHERE rider_id = v_leave_rider.id AND status IN ('assigned','accepted','picked_up')
    LOOP
      v_backup_id := NULL;
      v_fallback_id := NULL;

      SELECT a.locality_id INTO v_locality_id
      FROM orders o JOIN subscriptions s ON s.id = o.subscription_id
      JOIN addresses a ON a.id = s.delivery_address_id WHERE o.id = v_assignment.order_id;

      FOR v_rider IN
        SELECT r.id FROM riders r
        JOIN rider_zone_assignments rza ON rza.rider_id = r.id
        WHERE rza.locality_id = v_locality_id AND rza.priority_level = 'backup'
          AND r.is_active = true AND r.id <> ALL(v_leave_ids)
        ORDER BY rza.priority_level
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
          ORDER BY COALESCE((v_load_map ->> r.id::text)::integer, 0) ASC
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
        UPDATE rider_order_assignments SET status = 'reassigned', is_reassigned = true,
          swap_reason = 'Rider on planned leave', swapped_from_rider_id = v_leave_rider.id, updated_at = now()
        WHERE id = v_assignment.id;

        INSERT INTO rider_order_assignments (rider_id, order_id, status, auto_assigned, notes, swap_reason, swapped_from_rider_id)
        VALUES (COALESCE(v_backup_id, v_fallback_id), v_assignment.order_id, 'assigned', true,
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

-- ═══ 7. redistribute_no_shows function ═════════════════════════════════════

CREATE OR REPLACE FUNCTION redistribute_no_shows(target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
  FROM rider_leave_requests WHERE leave_date = target_date AND status = 'approved';

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

-- ═══ 8. calculate_delivery_route function (uses temp table, not RECORD[]) ═

CREATE OR REPLACE FUNCTION calculate_delivery_route(p_rider_id uuid, p_target_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_settings auto_assignment_settings%ROWTYPE;
  v_wh_lat double precision;
  v_wh_lng double precision;
  v_cur_lat double precision;
  v_cur_lng double precision;
  v_min_dist double precision;
  v_best_id uuid;
  v_result jsonb := '[]'::jsonb;
  v_item RECORD;
  v_seq integer := 0;
  v_remaining_count integer;
BEGIN
  SELECT * INTO v_settings FROM auto_assignment_settings WHERE id = 1;
  v_wh_lat := v_settings.warehouse_lat;
  v_wh_lng := v_settings.warehouse_lng;

  -- Use a temp table to hold remaining stops
  CREATE TEMP TABLE IF NOT EXISTS _route_stops (
    assignment_id uuid PRIMARY KEY,
    order_id uuid,
    lat double precision,
    lng double precision,
    street text,
    city text,
    locality_name text,
    customer_name text
  );

  DELETE FROM _route_stops;

  INSERT INTO _route_stops (assignment_id, order_id, lat, lng, street, city, locality_name, customer_name)
  SELECT roa.id, roa.order_id, a.lat, a.lng, a.street, a.city,
         l.locality_name, u.full_name
  FROM rider_order_assignments roa
  JOIN orders o ON o.id = roa.order_id
  JOIN subscriptions s ON s.id = o.subscription_id
  JOIN addresses a ON a.id = s.delivery_address_id
  LEFT JOIN localities l ON l.id = a.locality_id
  LEFT JOIN profiles u ON u.id = o.user_id
  WHERE roa.rider_id = p_rider_id
    AND roa.status IN ('assigned','accepted','picked_up')
    AND o.scheduled_date = p_target_date
    AND a.lat IS NOT NULL AND a.lng IS NOT NULL;

  v_cur_lat := v_wh_lat;
  v_cur_lng := v_wh_lng;

  SELECT count(*) INTO v_remaining_count FROM _route_stops;

  IF v_cur_lat IS NULL AND v_remaining_count > 0 THEN
    SELECT lat, lng INTO v_cur_lat, v_cur_lng FROM _route_stops ORDER BY assignment_id LIMIT 1;
  END IF;

  WHILE v_remaining_count > 0 LOOP
    v_best_id := NULL;
    v_min_dist := 1e18;

    SELECT assignment_id INTO v_best_id FROM _route_stops
    ORDER BY power(lat - v_cur_lat, 2) + power(lng - v_cur_lng, 2) ASC
    LIMIT 1;

    IF v_best_id IS NULL THEN
      EXIT;
    END IF;

    SELECT * INTO v_item FROM _route_stops WHERE assignment_id = v_best_id;
    v_seq := v_seq + 1;

    v_result := v_result || jsonb_build_object(
      'sequence', v_seq, 'assignment_id', v_item.assignment_id,
      'order_id', v_item.order_id, 'customer_name', v_item.customer_name,
      'street', v_item.street, 'city', v_item.city, 'locality_name', v_item.locality_name,
      'lat', v_item.lat, 'lng', v_item.lng);

    v_cur_lat := v_item.lat;
    v_cur_lng := v_item.lng;

    DELETE FROM _route_stops WHERE assignment_id = v_best_id;
    v_remaining_count := v_remaining_count - 1;
  END LOOP;

  DROP TABLE IF EXISTS _route_stops;

  RETURN jsonb_build_object('route', v_result, 'total_stops', v_seq,
    'warehouse_lat', v_wh_lat, 'warehouse_lng', v_wh_lng);
END;
$$;

-- ═══ 9. Cron jobs ═════════════════════════════════════════════════════════

SELECT cron.schedule('auto-assign-riders-daily', '35 0 * * *', $$SELECT auto_assign_riders(CURRENT_DATE)$$);
SELECT cron.schedule('no-show-detection-615am', '45 0 * * *', $$SELECT redistribute_no_shows(CURRENT_DATE)$$);
SELECT cron.schedule('no-show-safety-pass-630am', '0 1 * * *', $$SELECT redistribute_no_shows(CURRENT_DATE)$$);
SELECT cron.schedule('nightly-leave-redistribution', '30 16 * * *', $$SELECT redistribute_planned_leave(CURRENT_DATE + 1)$$);

-- Fix 1: auto_assign_riders — the capacity total was computed by aliasing
-- jsonb_each_text's output to t(val), which renames the KEY column (rider UUID),
-- so casting it to integer failed with "invalid input syntax for type integer".
-- Use the value column explicitly instead.
CREATE OR REPLACE FUNCTION public.auto_assign_riders(target_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
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
v_temp_cover RECORD;
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
SELECT sum((t.v)::integer) INTO v_total_capacity FROM jsonb_each_text(v_cap_map) AS t(k, v);

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

-- Active temporary reassignment window wins over the primary rider
SELECT roa.rider_id, roa.temp_reassign_start_date, roa.temp_reassign_end_date
INTO v_temp_cover
FROM rider_order_assignments roa
JOIN orders o2 ON o2.id = roa.order_id
WHERE o2.subscription_id = v_order.subscription_id
AND roa.is_temporary_reassign = true
AND roa.status IN ('assigned','accepted','picked_up')
AND target_date BETWEEN COALESCE(roa.temp_reassign_start_date, target_date)
AND COALESCE(roa.temp_reassign_end_date, target_date)
ORDER BY roa.assigned_at DESC
LIMIT 1;

IF v_temp_cover.rider_id IS NOT NULL THEN
INSERT INTO rider_order_assignments
(rider_id, order_id, status, notes, auto_assigned,
swapped_from_rider_id, swap_reason,
is_temporary_reassign, temp_reassign_start_date, temp_reassign_end_date, original_rider_id)
SELECT v_temp_cover.rider_id, v_order.id, 'assigned', 'Temporary reassignment cover', true,
s.primary_rider_id, 'Temporary reassignment cover',
true, v_temp_cover.temp_reassign_start_date, v_temp_cover.temp_reassign_end_date, s.primary_rider_id
FROM subscriptions s WHERE s.id = v_order.subscription_id;
UPDATE orders SET status = 'out_for_delivery' WHERE id = v_order.id;
v_current_load := COALESCE((v_load_map ->> v_temp_cover.rider_id::text)::integer, 0);
v_load_map := jsonb_set(v_load_map, ARRAY[v_temp_cover.rider_id::text], to_jsonb(v_current_load + 1));
v_assigned_count := v_assigned_count + 1;
CONTINUE;
END IF;

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
'primary_assigned', v_primary_assigned, 'total_orders', v_total_orders,
'total_available', v_total_available, 'total_capacity', v_total_capacity,
'total_unassigned', v_total_unassigned, 'use_present_only', v_use_present,
'target_date', target_date);
END;
$function$;

-- Fix 2 & 3: the track-generate-orders and track-daily-renewal-check cron jobs
-- were registered with commands calling wrapper functions that never existed.
-- Their original purpose (from the 20260906 migration) was to log the edge
-- function trigger into automation_run_logs. Recreate those wrappers.
CREATE OR REPLACE FUNCTION public.generate_daily_orders()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
SELECT 'generate_daily_orders', CURRENT_DATE, 'success', jsonb_build_object('triggered', true)
WHERE NOT EXISTS (SELECT 1 FROM automation_run_logs WHERE automation_name = 'generate_daily_orders' AND run_date = CURRENT_DATE)
ON CONFLICT (automation_name, run_date) DO NOTHING;
RETURN jsonb_build_object('logged', true, 'automation', 'generate_daily_orders', 'run_date', CURRENT_DATE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.daily_renewal_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
INSERT INTO automation_run_logs (automation_name, run_date, status, summary)
SELECT 'daily_renewal_check', CURRENT_DATE, 'success', jsonb_build_object('triggered', true)
WHERE NOT EXISTS (SELECT 1 FROM automation_run_logs WHERE automation_name = 'daily_renewal_check' AND run_date = CURRENT_DATE)
ON CONFLICT (automation_name, run_date) DO NOTHING;
RETURN jsonb_build_object('logged', true, 'automation', 'daily_renewal_check', 'run_date', CURRENT_DATE);
END;
$function$;

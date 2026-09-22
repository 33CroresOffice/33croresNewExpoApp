/*
# Auto-Evaluate Rider Incentives and Calculate Monthly Rankings

## Overview
1. Creates `auto_evaluate_rider_incentives(p_month)` — SECURITY DEFINER function that
   reads each active rider's current-month data and checks against each active incentive
   rule's criteria. Upserts passed/failed into rider_incentive_evaluations with earned_amount.
2. Creates `calculate_rider_rankings(p_month)` — calls evaluation, computes performance
   score, upserts ranking into rider_monthly_rankings.
3. Seeds four standard incentive rules.
4. Schedules nightly pg_cron job.

## Functions
### auto_evaluate_rider_incentives(p_month text)
- on_time_attendance (per_day): counts days where check_in_time <= cutoff_time, earns amount * days
- on_time_delivery (per_day): counts deliveries where delivered_at time <= cutoff_time, earns amount * days
- no_leave (per_month): passes if zero absent and zero leave days
- customer_feedback (per_month): passes if admin awarded positive feedback
- flower_quality (per_month): passes if rider submitted at least one quality report
- custom: checks min_deliveries, min_present_days, max_absent_days thresholds

### calculate_rider_rankings(p_month text)
- Calls auto_evaluate, then scores: on_time_att*2 + on_time_del*3 + total_earned - absent*3 - leave*1
- Assigns rank_position (1=best), upserts into rider_monthly_rankings
- Returns ranked list as JSON

## Security
- Both functions SECURITY DEFINER, executable by authenticated
- Cron uses service role

## Seeded Incentives
- On-Time Attendance Bonus: ₹10/day, cutoff 05:30
- On-Time Delivery Bonus: ₹20/day, cutoff 07:30
- No-Leave Bonus: ₹500/month
- Customer Feedback Bonus: ₹200/month
*/

-- ═══ 1. auto_evaluate_rider_incentives ═════════════════════════════════════

CREATE OR REPLACE FUNCTION auto_evaluate_rider_incentives(p_month text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date := (p_month || '-01')::date;
  v_month_end date := (date_trunc('month', v_month_start) + interval '1 month')::date;
  v_rider RECORD;
  v_inc RECORD;
  v_earned numeric(10,2) := 0;
  v_status text := 'failed';
  v_on_time_att_days int := 0;
  v_on_time_del_days int := 0;
  v_present_count int := 0;
  v_absent_count int := 0;
  v_leave_count int := 0;
  v_delivery_count int := 0;
  v_has_feedback bool := false;
  v_has_quality_report bool := false;
  v_cutoff_time text;
  v_result text;
BEGIN
  FOR v_rider IN SELECT id FROM riders WHERE is_active = true LOOP

    SELECT COUNT(*) FILTER (WHERE status = 'present') INTO v_present_count
    FROM rider_attendance
    WHERE rider_id = v_rider.id AND date >= v_month_start::text AND date < v_month_end::text;

    SELECT COUNT(*) FILTER (WHERE status = 'absent') INTO v_absent_count
    FROM rider_attendance
    WHERE rider_id = v_rider.id AND date >= v_month_start::text AND date < v_month_end::text;

    SELECT COUNT(*) INTO v_leave_count
    FROM (
      SELECT 1 FROM rider_leave_requests
      WHERE rider_id = v_rider.id
        AND leave_date >= v_month_start::text
        AND leave_date < v_month_end::text
        AND status = 'approved'
      UNION
      SELECT 1 FROM rider_attendance
      WHERE rider_id = v_rider.id
        AND status = 'leave'
        AND date >= v_month_start::text
        AND date < v_month_end::text
    ) AS combined_leaves;

    SELECT COUNT(*) INTO v_delivery_count
    FROM rider_order_assignments
    WHERE rider_id = v_rider.id
      AND status = 'delivered'
      AND delivered_at >= v_month_start::timestamptz
      AND delivered_at < v_month_end::timestamptz;

    SELECT EXISTS(
      SELECT 1 FROM rider_customer_feedback
      WHERE rider_id = v_rider.id AND month = p_month AND rating = 'positive'
    ) INTO v_has_feedback;

    SELECT EXISTS(
      SELECT 1 FROM rider_quality_reports
      WHERE rider_id = v_rider.id
        AND created_at >= v_month_start::timestamptz
        AND created_at < v_month_end::timestamptz
    ) INTO v_has_quality_report;

    FOR v_inc IN SELECT * FROM rider_incentives WHERE is_active = true LOOP
      v_earned := 0;
      v_status := 'failed';
      v_cutoff_time := v_inc.cutoff_time;

      IF v_inc.bonus_category = 'on_time_attendance' THEN
        SELECT COUNT(*) INTO v_on_time_att_days
        FROM rider_attendance
        WHERE rider_id = v_rider.id
          AND status = 'present'
          AND date >= v_month_start::text
          AND date < v_month_end::text
          AND check_in_time IS NOT NULL
          AND to_char(check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') <= v_cutoff_time;

        IF v_on_time_att_days > 0 THEN
          v_status := 'passed';
          v_earned := v_on_time_att_days * v_inc.amount;
        END IF;

      ELSIF v_inc.bonus_category = 'on_time_delivery' THEN
        SELECT COUNT(*) INTO v_on_time_del_days
        FROM rider_order_assignments
        WHERE rider_id = v_rider.id
          AND status = 'delivered'
          AND delivered_at >= v_month_start::timestamptz
          AND delivered_at < v_month_end::timestamptz
          AND to_char(delivered_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') <= v_cutoff_time;

        IF v_on_time_del_days > 0 THEN
          v_status := 'passed';
          v_earned := v_on_time_del_days * v_inc.amount;
        END IF;

      ELSIF v_inc.bonus_category = 'no_leave' THEN
        IF v_absent_count = 0 AND v_leave_count = 0 THEN
          v_status := 'passed';
          v_earned := v_inc.amount;
        END IF;

      ELSIF v_inc.bonus_category = 'customer_feedback' THEN
        IF v_has_feedback THEN
          v_status := 'passed';
          v_earned := v_inc.amount;
        END IF;

      ELSIF v_inc.bonus_category = 'flower_quality' THEN
        IF v_has_quality_report THEN
          v_status := 'passed';
          v_earned := v_inc.amount;
        END IF;

      ELSE
        v_status := 'passed';
        v_earned := v_inc.amount;

        IF v_inc.min_deliveries IS NOT NULL AND v_delivery_count < v_inc.min_deliveries THEN
          v_status := 'failed';
          v_earned := 0;
        END IF;

        IF v_status = 'passed' AND v_inc.min_present_days IS NOT NULL AND v_present_count < v_inc.min_present_days THEN
          v_status := 'failed';
          v_earned := 0;
        END IF;

        IF v_status = 'passed' AND v_inc.max_absent_days IS NOT NULL AND v_absent_count > v_inc.max_absent_days THEN
          v_status := 'failed';
          v_earned := 0;
        END IF;

        IF v_status = 'passed' AND COALESCE(v_inc.evaluation_basis, v_inc.type) = 'per_day' THEN
          v_earned := v_present_count * v_inc.amount;
        END IF;
      END IF;

      INSERT INTO rider_incentive_evaluations (rider_id, incentive_id, month, status, earned_amount, qualified_at, qualified_by, notes)
      VALUES (v_rider.id, v_inc.id, p_month, v_status, v_earned,
        CASE WHEN v_status = 'passed' THEN now() ELSE null END,
        null,
        'auto-evaluated')
      ON CONFLICT (rider_id, incentive_id, month)
      DO UPDATE SET
        status = EXCLUDED.status,
        earned_amount = EXCLUDED.earned_amount,
        qualified_at = EXCLUDED.qualified_at,
        notes = 'auto-evaluated',
        updated_at = now();
    END LOOP;
  END LOOP;

  v_result := 'Evaluated incentives for month ' || p_month;
  RETURN v_result;
END;
$$;

-- ═══ 2. calculate_rider_rankings ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION calculate_rider_rankings(p_month text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_start date := (p_month || '-01')::date;
  v_month_end date := (date_trunc('month', v_month_start) + interval '1 month')::date;
  v_eval_result text;
  v_rider RECORD;
  v_score numeric(10,2) := 0;
  v_total_earned numeric(10,2) := 0;
  v_deliveries int := 0;
  v_present int := 0;
  v_absent int := 0;
  v_leaves int := 0;
  v_on_time_att int := 0;
  v_on_time_del int := 0;
  v_att_cutoff text;
  v_del_cutoff text;
  v_result json;
BEGIN
  v_eval_result := auto_evaluate_rider_incentives(p_month);

  SELECT cutoff_time INTO v_att_cutoff
  FROM rider_incentives WHERE bonus_category = 'on_time_attendance' AND is_active = true LIMIT 1;
  SELECT cutoff_time INTO v_del_cutoff
  FROM rider_incentives WHERE bonus_category = 'on_time_delivery' AND is_active = true LIMIT 1;

  FOR v_rider IN
    SELECT r.id, r.full_name
    FROM riders r
    WHERE r.is_active = true
    ORDER BY r.full_name
  LOOP
    SELECT COUNT(*) INTO v_deliveries
    FROM rider_order_assignments
    WHERE rider_id = v_rider.id
      AND status = 'delivered'
      AND delivered_at >= v_month_start::timestamptz
      AND delivered_at < v_month_end::timestamptz;

    SELECT COUNT(*) FILTER (WHERE status = 'present') INTO v_present
    FROM rider_attendance
    WHERE rider_id = v_rider.id AND date >= v_month_start::text AND date < v_month_end::text;

    SELECT COUNT(*) FILTER (WHERE status = 'absent') INTO v_absent
    FROM rider_attendance
    WHERE rider_id = v_rider.id AND date >= v_month_start::text AND date < v_month_end::text;

    SELECT COUNT(*) INTO v_leaves
    FROM (
      SELECT 1 FROM rider_leave_requests
      WHERE rider_id = v_rider.id
        AND leave_date >= v_month_start::text
        AND leave_date < v_month_end::text
        AND status = 'approved'
      UNION
      SELECT 1 FROM rider_attendance
      WHERE rider_id = v_rider.id
        AND status = 'leave'
        AND date >= v_month_start::text
        AND date < v_month_end::text
    ) AS combined_leaves;

    IF v_att_cutoff IS NOT NULL THEN
      SELECT COUNT(*) INTO v_on_time_att
      FROM rider_attendance
      WHERE rider_id = v_rider.id
        AND status = 'present'
        AND date >= v_month_start::text
        AND date < v_month_end::text
        AND check_in_time IS NOT NULL
        AND to_char(check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') <= v_att_cutoff;
    END IF;

    IF v_del_cutoff IS NOT NULL THEN
      SELECT COUNT(*) INTO v_on_time_del
      FROM rider_order_assignments
      WHERE rider_id = v_rider.id
        AND status = 'delivered'
        AND delivered_at >= v_month_start::timestamptz
        AND delivered_at < v_month_end::timestamptz
        AND to_char(delivered_at AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') <= v_del_cutoff;
    END IF;

    SELECT COALESCE(SUM(earned_amount), 0) INTO v_total_earned
    FROM rider_incentive_evaluations
    WHERE rider_id = v_rider.id
      AND month = p_month
      AND status = 'passed';

    v_score := (v_on_time_att * 2.0) + (v_on_time_del * 3.0) + v_total_earned
      - (v_absent * 3.0) - (v_leaves * 1.0);

    INSERT INTO rider_monthly_rankings (rider_id, month, score, total_earned, deliveries, present_days, absent_days, leave_days, on_time_attendance_days, on_time_delivery_days)
    VALUES (v_rider.id, p_month, v_score, v_total_earned, v_deliveries, v_present, v_absent, v_leaves, v_on_time_att, v_on_time_del)
    ON CONFLICT (rider_id, month)
    DO UPDATE SET
      score = EXCLUDED.score,
      total_earned = EXCLUDED.total_earned,
      deliveries = EXCLUDED.deliveries,
      present_days = EXCLUDED.present_days,
      absent_days = EXCLUDED.absent_days,
      leave_days = EXCLUDED.leave_days,
      on_time_attendance_days = EXCLUDED.on_time_attendance_days,
      on_time_delivery_days = EXCLUDED.on_time_delivery_days,
      updated_at = now();
  END LOOP;

  WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY score DESC) as rn
    FROM rider_monthly_rankings
    WHERE month = p_month
  )
  UPDATE rider_monthly_rankings rmr
  SET rank_position = ranked.rn
  FROM ranked
  WHERE rmr.id = ranked.id;

  SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) INTO v_result
  FROM (
    SELECT rmr.rider_id, r.full_name, rmr.score, rmr.rank_position,
           rmr.total_earned, rmr.deliveries, rmr.present_days,
           rmr.absent_days, rmr.leave_days, rmr.on_time_attendance_days,
           rmr.on_time_delivery_days
    FROM rider_monthly_rankings rmr
    JOIN riders r ON r.id = rmr.rider_id
    WHERE rmr.month = p_month
    ORDER BY rmr.rank_position ASC
  ) t;

  RETURN v_result;
END;
$$;

-- ═══ 3. Grant execute ══════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION auto_evaluate_rider_incentives(text) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_rider_rankings(text) TO authenticated;

-- ═══ 4. Seed standard incentive rules ══════════════════════════════════════

INSERT INTO rider_incentives (name, amount, type, is_active, bonus_category, evaluation_basis, cutoff_time)
SELECT 'On-Time Attendance Bonus', 10, 'per_day', true, 'on_time_attendance', 'per_day', '05:30'
WHERE NOT EXISTS (SELECT 1 FROM rider_incentives WHERE bonus_category = 'on_time_attendance');

INSERT INTO rider_incentives (name, amount, type, is_active, bonus_category, evaluation_basis, cutoff_time)
SELECT 'On-Time Delivery Bonus', 20, 'per_day', true, 'on_time_delivery', 'per_day', '07:30'
WHERE NOT EXISTS (SELECT 1 FROM rider_incentives WHERE bonus_category = 'on_time_delivery');

INSERT INTO rider_incentives (name, amount, type, is_active, bonus_category, evaluation_basis, cutoff_time)
SELECT 'No-Leave Bonus', 500, 'per_month', true, 'no_leave', 'per_month', null
WHERE NOT EXISTS (SELECT 1 FROM rider_incentives WHERE bonus_category = 'no_leave');

INSERT INTO rider_incentives (name, amount, type, is_active, bonus_category, evaluation_basis, cutoff_time)
SELECT 'Customer Feedback Bonus', 200, 'per_month', true, 'customer_feedback', 'per_month', null
WHERE NOT EXISTS (SELECT 1 FROM rider_incentives WHERE bonus_category = 'customer_feedback');

-- ═══ 5. Nightly cron job ════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'auto-evaluate-rider-incentives-nightly') THEN
    PERFORM cron.schedule(
      'auto-evaluate-rider-incentives-nightly',
      '0 18 * * *',
      $cron$
        SELECT auto_evaluate_rider_incentives(
          to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM')
        );
        SELECT calculate_rider_rankings(
          to_char((now() AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM')
        );
      $cron$
    );
  END IF;
END $$;

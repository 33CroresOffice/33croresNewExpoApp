/*
# Fix On-Time Categories to Respect Per Day / Per Month Type

## Overview
The `on_time_attendance` and `on_time_delivery` incentive categories always
multiplied `amount × qualifying_days`, ignoring the Admin-selected type
(`per_day` vs `per_month`). When the Admin selects Per Month, the bonus
should be a flat amount (paid once if the rider qualifies), not multiplied
by the number of on-time days.

## Root Cause
- `on_time_attendance`: `v_earned := v_on_time_att_days * v_inc.amount` —
  always multiplies, regardless of type.
- `on_time_delivery`: `v_earned := v_on_time_del_days * v_inc.amount` —
  same issue.

## Fix
1. `on_time_attendance`: if `per_day`, earned = `on_time_att_days × amount`;
   if `per_month`, earned = flat `amount` (if at least 1 qualifying day).
2. `on_time_delivery`: if `per_day`, earned = `on_time_del_days × amount`;
   if `per_month`, earned = flat `amount` (if at least 1 qualifying day).
3. All other categories already handle per_day/per_month correctly from
   the previous migration.

## Security
No table structure or RLS changes. Only the SECURITY DEFINER function body.
*/

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
  v_basis text;
BEGIN
  FOR v_rider IN SELECT id FROM riders WHERE is_active = true LOOP

    SELECT COUNT(*) FILTER (WHERE status = 'present') INTO v_present_count
    FROM rider_attendance
    WHERE rider_id = v_rider.id AND date >= v_month_start AND date < v_month_end;

    SELECT COUNT(*) FILTER (WHERE status = 'absent') INTO v_absent_count
    FROM rider_attendance
    WHERE rider_id = v_rider.id AND date >= v_month_start AND date < v_month_end;

    SELECT COUNT(*) INTO v_leave_count
    FROM (
      SELECT 1 FROM rider_leave_requests
      WHERE rider_id = v_rider.id
        AND leave_date >= v_month_start
        AND leave_date < v_month_end
        AND status = 'approved'
      UNION
      SELECT 1 FROM rider_attendance
      WHERE rider_id = v_rider.id
        AND status = 'leave'
        AND date >= v_month_start
        AND date < v_month_end
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
      v_basis := COALESCE(v_inc.evaluation_basis, v_inc.type);

      IF v_inc.bonus_category = 'on_time_attendance' THEN
        SELECT COUNT(*) INTO v_on_time_att_days
        FROM rider_attendance
        WHERE rider_id = v_rider.id
          AND status = 'present'
          AND date >= v_month_start
          AND date < v_month_end
          AND check_in_time IS NOT NULL
          AND to_char(check_in_time AT TIME ZONE 'Asia/Kolkata', 'HH24:MI') <= v_cutoff_time;

        IF v_on_time_att_days > 0 THEN
          v_status := 'passed';
          IF v_basis = 'per_day' THEN
            v_earned := v_on_time_att_days * v_inc.amount;
          ELSE
            v_earned := v_inc.amount;
          END IF;
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
          IF v_basis = 'per_day' THEN
            v_earned := v_on_time_del_days * v_inc.amount;
          ELSE
            v_earned := v_inc.amount;
          END IF;
        END IF;

      ELSIF v_inc.bonus_category = 'no_leave' THEN
        IF v_absent_count = 0 AND v_leave_count = 0 AND v_present_count > 0 THEN
          v_status := 'passed';
          IF v_basis = 'per_day' THEN
            v_earned := v_present_count * v_inc.amount;
          ELSE
            v_earned := v_inc.amount;
          END IF;
        END IF;

      ELSIF v_inc.bonus_category = 'customer_feedback' THEN
        IF v_has_feedback THEN
          v_status := 'passed';
          IF v_basis = 'per_day' THEN
            v_earned := v_present_count * v_inc.amount;
          ELSE
            v_earned := v_inc.amount;
          END IF;
        END IF;

      ELSIF v_inc.bonus_category = 'flower_quality' THEN
        IF v_has_quality_report THEN
          v_status := 'passed';
          IF v_basis = 'per_day' THEN
            v_earned := v_present_count * v_inc.amount;
          ELSE
            v_earned := v_inc.amount;
          END IF;
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

        IF v_status = 'passed' AND v_basis = 'per_day' THEN
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

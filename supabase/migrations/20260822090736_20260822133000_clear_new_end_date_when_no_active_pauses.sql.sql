/*
# Clear pause-adjusted expiry when no active pauses remain

1. Modified Tables
- `subscriptions`
  - `new_end_date` remains the derived pause-adjusted expiry date.
  - `end_date` remains the original subscription expiry and is never changed.
- `subscription_pause_history`
  - Existing `is_cancelled` values continue to determine which pause periods
    are included in the calculation.

2. Calculation Rules
- Sum all pause days from every history row where `is_cancelled` is false.
- Completed pauses count inclusively from `pause_start_date` through
  `pause_until`.
- Early-resumed pauses count from `pause_start_date` up to, but not including,
  `resumed_at`.
- Set `subscriptions.new_end_date` to the fixed original `end_date` plus the
  total active pause days when the total is greater than zero.
- Set `subscriptions.new_end_date` to NULL when no active pause days remain,
  including after a pause is cancelled.

3. Security
- Preserve `SECURITY DEFINER` and the fixed `public` search path.
- Preserve the existing revocation of direct function execution for public
  and authenticated roles.
- No RLS policies are changed.

4. Important Notes
1. This migration never updates, replaces, or derives a new value for
   `subscriptions.end_date`.
2. Cancelling a pause excludes that history row from the total through the
   existing history update trigger.
3. Re-running the migration is safe and recalculates all subscriptions using
   the corrected rule.
*/

CREATE OR REPLACE FUNCTION public.recalculate_subscription_new_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_subscription_id uuid;
  total_paused_days integer;
BEGIN
  target_subscription_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.subscription_id
    ELSE NEW.subscription_id
  END;

  SELECT COALESCE(SUM(
    GREATEST(
      CASE
        WHEN h.resumed_at IS NOT NULL
          THEN h.resumed_at - h.pause_start_date
        ELSE (h.pause_until - h.pause_start_date) + 1
      END,
      0
    )
  )::integer, 0)
  INTO total_paused_days
  FROM public.subscription_pause_history AS h
  WHERE h.subscription_id = target_subscription_id
    AND COALESCE(h.is_cancelled, false) = false;

  UPDATE public.subscriptions AS s
  SET new_end_date = CASE
    WHEN s.end_date IS NULL OR total_paused_days <= 0 THEN NULL
    ELSE s.end_date + total_paused_days
  END
  WHERE s.id = target_subscription_id;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.recalculate_subscription_new_end_date() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_subscription_new_end_date() FROM anon, authenticated;

UPDATE public.subscriptions AS s
SET new_end_date = CASE
  WHEN s.end_date IS NULL OR pause_totals.total_paused_days <= 0 THEN NULL
  ELSE s.end_date + pause_totals.total_paused_days
END
FROM (
  SELECT
    h.subscription_id,
    COALESCE(SUM(
      GREATEST(
        CASE
          WHEN h.resumed_at IS NOT NULL
            THEN h.resumed_at - h.pause_start_date
          ELSE (h.pause_until - h.pause_start_date) + 1
        END,
        0
      )
    )::integer, 0) AS total_paused_days
  FROM public.subscription_pause_history AS h
  WHERE COALESCE(h.is_cancelled, false) = false
  GROUP BY h.subscription_id
) AS pause_totals
WHERE s.id = pause_totals.subscription_id;

UPDATE public.subscriptions AS s
SET new_end_date = NULL
WHERE NOT EXISTS (
  SELECT 1
  FROM public.subscription_pause_history AS h
  WHERE h.subscription_id = s.id
    AND COALESCE(h.is_cancelled, false) = false
);

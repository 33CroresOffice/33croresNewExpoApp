/*
# Align derived end dates with actual paused days

## Summary
Ensure `subscriptions.new_end_date` counts the correct number of paused days
when a customer resumes early.

## Changes
- `recalculate_subscription_new_end_date()`: completed pauses count from
  `pause_start_date` through `pause_until` inclusively. Early-resumed pauses
  count from `pause_start_date` up to, but not including, `resumed_at`, matching
  the app's existing resume behavior.

## Security
- Preserve `SECURITY DEFINER` and the fixed `public` search path.
- No RLS policy changes.

## Important Notes
1. The original `subscriptions.end_date` remains unchanged.
2. Cancelled pause-history rows are excluded.
3. The migration is idempotent and only replaces the function body.
*/

CREATE OR REPLACE FUNCTION public.recalculate_subscription_new_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_subscription_id uuid;
BEGIN
  target_subscription_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.subscription_id
    ELSE NEW.subscription_id
  END;

  UPDATE public.subscriptions AS s
  SET new_end_date = CASE
    WHEN s.end_date IS NULL THEN NULL
    ELSE s.end_date + COALESCE((
      SELECT SUM(
        GREATEST(
          CASE
            WHEN h.resumed_at IS NOT NULL
              THEN h.resumed_at - h.pause_start_date
            ELSE (h.pause_until - h.pause_start_date) + 1
          END,
          0
        )
      )::integer
      FROM public.subscription_pause_history AS h
      WHERE h.subscription_id = target_subscription_id
        AND COALESCE(h.is_cancelled, false) = false
    ), 0)
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

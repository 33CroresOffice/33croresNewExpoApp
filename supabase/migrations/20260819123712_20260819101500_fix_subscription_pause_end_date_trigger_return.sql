/*
# Fix pause end-date trigger return handling

## Summary
Correct the trigger function used to maintain `subscriptions.new_end_date` so
it returns the proper row for both pause-history inserts/updates and deletes.

## Changes
- `recalculate_subscription_new_end_date()`: return `OLD` for deletes and
  `NEW` for inserts/updates after recalculating the parent subscription.

## Security
- Preserve `SECURITY DEFINER` and the fixed `public` search path.
- No RLS policy changes.

## Important Notes
1. The original `subscriptions.end_date` remains unchanged.
2. This migration only replaces the trigger function body; the trigger itself
   remains in place.
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
          (COALESCE(h.resumed_at, h.pause_until) - h.pause_start_date) + 1,
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

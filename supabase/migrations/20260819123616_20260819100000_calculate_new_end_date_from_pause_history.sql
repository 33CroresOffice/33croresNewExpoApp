/*
# Calculate subscription new end dates from pause history

## Summary
Keep each subscription's original `end_date` unchanged and calculate the extended
end date in `new_end_date` from the total paused days recorded in
`subscription_pause_history`.

## Changes
- `subscriptions.new_end_date`: ensured as a nullable date column.
- New function `recalculate_subscription_new_end_date()`: sets
  `new_end_date` to `end_date` plus all non-cancelled paused days. For a pause
  resumed early, days are counted through `resumed_at`; otherwise they are
  counted through `pause_until`.
- New trigger on `subscription_pause_history`: recalculates the parent
  subscription after a pause is inserted, edited, resumed, or cancelled.
- Existing pause-history logging continues to create a history row when a new
  pause is added from `subscriptions`.

## Security
- The recalculation function runs as `SECURITY DEFINER` with a fixed
  `search_path` so customer-side row-level security cannot prevent the derived
  date from being maintained.
- No RLS policies are changed.

## Important Notes
1. The original `subscriptions.end_date` is never updated by this migration.
2. Existing pause history is included when a subscription's derived end date is
   recalculated.
3. The migration is idempotent and safe to re-run.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subscriptions'
      AND column_name = 'new_end_date'
  ) THEN
    ALTER TABLE public.subscriptions ADD COLUMN new_end_date date;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.recalculate_subscription_new_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_subscription_id uuid;
BEGIN
  target_subscription_id := COALESCE(NEW.subscription_id, OLD.subscription_id);

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

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS recalculate_subscription_new_end_date_on_pause_history
  ON public.subscription_pause_history;

CREATE TRIGGER recalculate_subscription_new_end_date_on_pause_history
  AFTER INSERT OR UPDATE OR DELETE ON public.subscription_pause_history
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_subscription_new_end_date();

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
    WHERE h.subscription_id = s.id
      AND COALESCE(h.is_cancelled, false) = false
  ), 0)
END
WHERE EXISTS (
  SELECT 1
  FROM public.subscription_pause_history AS h
  WHERE h.subscription_id = s.id
);

REVOKE EXECUTE ON FUNCTION public.recalculate_subscription_new_end_date() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.recalculate_subscription_new_end_date() FROM anon, authenticated;

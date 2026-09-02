/*
# Protect original subscription start_date and end_date from being overwritten

## Summary
The original `start_date` and `end_date` on a subscription must never change
after the subscription is created. Pauses, resumes, cancellations, and admin
edits should only affect `new_end_date` (the pause-adjusted expiry) and pause
fields. This migration locks the original dates at the database level so no
UPDATE path — customer app, admin panel, or edge function using the anon/auth
key — can overwrite them.

## Changes
1. Revoke UPDATE on `start_date` and `end_date` from `authenticated` and
   `anon` roles. Column privileges are checked BEFORE row-level policies, so
   even though the existing UPDATE policy allows admins to update their
   subscription rows, they can no longer touch these two columns.
2. Add a trigger `guard_subscription_original_dates` that raises an exception
   if any UPDATE changes `start_date` or `end_date` to a different value.
   This is a second line of defense for the service-role key (which bypasses
   RLS and column grants) and for any future code path that might try to write
   these columns with elevated privileges.
3. Keep `new_end_date`, `pause_start_date`, `pause_until`, `status`, and all
   other columns fully writable — only the two original dates are protected.

## Security
- Column-level UPDATE grants narrow what the `authenticated` and `anon` roles
  can write, independent of row-level policies.
- The trigger enforces the rule at the table level for ALL roles, including
  `service_role`.
- No RLS policies are changed.

## Important Notes
1. `start_date` and `end_date` can still be set on INSERT (new subscription or
   renewal) — the trigger only fires on UPDATE.
2. The `recalculate_subscription_new_end_date()` trigger continues to update
   only `new_end_date`; it never touches `end_date`.
3. The `admin-create-subscription` edge function sets both dates at insert
   time and is unaffected.
4. Re-running this migration is safe — all statements are idempotent.
*/

-- ── 1. Column-level grants: revoke UPDATE on original dates ──────────────
-- authenticated role
REVOKE UPDATE (start_date, end_date) ON public.subscriptions FROM authenticated;
-- anon role (in case any no-auth path exists)
REVOKE UPDATE (start_date, end_date) ON public.subscriptions FROM anon;

-- Re-grant UPDATE on the remaining columns so legitimate updates still work
GRANT UPDATE (
  status,
  pause_start_date,
  pause_until,
  new_end_date,
  next_delivery_date,
  renewal_status,
  renewal_notified_at,
  renewed_from_subscription_id,
  plan_id,
  delivery_address_id
) ON public.subscriptions TO authenticated;

-- ── 2. Trigger: block UPDATE that changes start_date or end_date ─────────
CREATE OR REPLACE FUNCTION public.guard_subscription_original_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.start_date IS DISTINCT FROM OLD.start_date THEN
    RAISE EXCEPTION 'start_date is permanent and cannot be changed after creation';
  END IF;
  IF NEW.end_date IS DISTINCT FROM OLD.end_date THEN
    RAISE EXCEPTION 'end_date is permanent and cannot be changed after creation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_subscription_original_dates ON public.subscriptions;
CREATE TRIGGER guard_subscription_original_dates
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_subscription_original_dates();

REVOKE EXECUTE ON FUNCTION public.guard_subscription_original_dates() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_subscription_original_dates() FROM anon, authenticated;

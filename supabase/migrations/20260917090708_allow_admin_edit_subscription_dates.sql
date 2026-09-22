/*
# Allow admin to edit subscription start_date and end_date

## Summary
The previous migration (20260822150000_protect_original_subscription_dates) locked
`start_date` and `end_date` so no role — including service_role — could change them
after creation. The admin Order Details screen now needs to edit these dates
directly. This migration:

1. Drops the `guard_subscription_original_dates` trigger so UPDATEs to
   `start_date` and `end_date` are no longer blocked at the table level.
2. Re-grants UPDATE on `start_date` and `end_date` to `authenticated` so the
   admin client (which uses the authenticated role via the service key path)
   can write these columns.
3. Keeps all other existing column grants and RLS policies unchanged.

## Security
- RLS policies on `subscriptions` remain in place — only admin users (checked
  via `raw_app_meta_data->>'role'`) can UPDATE subscription rows.
- The column-level REVOKE was the first layer blocking edits; the trigger was
  the second. Both are removed here so the admin panel can edit dates.
- No new tables, no data changes.
*/

-- 1. Drop the guard trigger so UPDATEs to start_date / end_date are allowed
DROP TRIGGER IF EXISTS guard_subscription_original_dates ON public.subscriptions;
DROP FUNCTION IF EXISTS public.guard_subscription_original_dates();

-- 2. Re-grant UPDATE on start_date and end_date to authenticated
GRANT UPDATE (start_date, end_date) ON public.subscriptions TO authenticated;

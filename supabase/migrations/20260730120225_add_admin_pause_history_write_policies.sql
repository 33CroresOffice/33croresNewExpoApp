/*
# Add admin insert/update policies for subscription_pause_history

## Problem
When an admin pauses a customer's subscription from the admin panel, the pause
details are saved to the `subscriptions` table (pause_start_date, pause_until) but
the insert into `subscription_pause_history` is silently blocked by RLS. The existing
INSERT and UPDATE policies only allow the subscription *owner* (auth.uid() = user_id)
to write. Admins are not the owner, so the insert fails silently and no history record
is created — the Pause History section appears empty.

## Changes
- Add an INSERT policy allowing admins (role = admin or super_admin in JWT app_metadata)
  to insert pause history rows for any subscription.
- Add an UPDATE policy allowing admins to update pause history rows (e.g. setting
  resumed_at when resuming early).
- The existing owner-scoped INSERT and UPDATE policies remain in place; these are
  additive.
*/

DROP POLICY IF EXISTS "Admins can insert pause history" ON subscription_pause_history;
CREATE POLICY "Admins can insert pause history"
ON subscription_pause_history FOR INSERT
TO authenticated
WITH CHECK (
  ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'super_admin'::text])
);

DROP POLICY IF EXISTS "Admins can update pause history" ON subscription_pause_history;
CREATE POLICY "Admins can update pause history"
ON subscription_pause_history FOR UPDATE
TO authenticated
USING (
  ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'super_admin'::text])
)
WITH CHECK (
  ((auth.jwt() -> 'app_metadata'::text) ->> 'role'::text) = ANY (ARRAY['admin'::text, 'super_admin'::text])
);

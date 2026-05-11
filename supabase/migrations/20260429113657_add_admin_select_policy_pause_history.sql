/*
  # Add admin SELECT policy for subscription_pause_history

  ## Problem
  The existing SELECT policy only allows subscription owners to read their own
  pause history. Admins (role stored in app_metadata) were blocked, causing
  the admin customer-detail page to show no pause/resume logs.

  ## Changes
  - Add a new SELECT policy that allows users with role='admin' or role='super_admin'
    in their JWT app_metadata to read all pause history records.
*/

CREATE POLICY "Admins can view all pause history"
  ON subscription_pause_history
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  );

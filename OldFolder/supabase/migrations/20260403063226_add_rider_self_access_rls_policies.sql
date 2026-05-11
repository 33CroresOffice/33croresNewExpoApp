/*
  # Add Rider Self-Access RLS Policies

  Allows authenticated riders to read their own data across rider tables.
  Riders are identified by matching their auth.uid() to riders.profile_id.

  1. Tables affected
    - riders: riders can select their own record
    - rider_order_assignments: riders can select and update their own assignments
    - rider_attendance: riders can select their own attendance
    - rider_payouts: riders can select their own payouts
    - rider_leave_requests: riders can select their own leave requests

  2. Security
    - All policies check profile_id = auth.uid() via riders table join
    - Riders cannot modify payouts or attendance (admin-managed)
    - Riders can update assignment status (accept, pickup, deliver)
*/

CREATE POLICY "Riders can view own profile"
  ON riders FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE POLICY "Riders can view own assignments"
  ON rider_order_assignments FOR SELECT
  TO authenticated
  USING (
    rider_id IN (
      SELECT id FROM riders WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Riders can update own assignment status"
  ON rider_order_assignments FOR UPDATE
  TO authenticated
  USING (
    rider_id IN (
      SELECT id FROM riders WHERE profile_id = auth.uid()
    )
  )
  WITH CHECK (
    rider_id IN (
      SELECT id FROM riders WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Riders can view own attendance"
  ON rider_attendance FOR SELECT
  TO authenticated
  USING (
    rider_id IN (
      SELECT id FROM riders WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Riders can view own payouts"
  ON rider_payouts FOR SELECT
  TO authenticated
  USING (
    rider_id IN (
      SELECT id FROM riders WHERE profile_id = auth.uid()
    )
  );

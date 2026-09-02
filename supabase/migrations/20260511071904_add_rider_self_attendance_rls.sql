/*
  # Add rider self-service RLS policies for rider_attendance

  ## Problem
  Riders could not mark their own attendance because the only INSERT policy
  was restricted to admins. There was also no UPDATE policy for riders.

  ## Changes
  - Add INSERT policy: riders can insert their own attendance row
  - Add UPDATE policy: riders can update their own attendance row
    (needed for upsert with onConflict to work)
*/

CREATE POLICY "Riders can insert own attendance"
  ON rider_attendance
  FOR INSERT
  TO authenticated
  WITH CHECK (
    rider_id IN (
      SELECT id FROM riders WHERE profile_id = auth.uid()
    )
  );

CREATE POLICY "Riders can update own attendance"
  ON rider_attendance
  FOR UPDATE
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

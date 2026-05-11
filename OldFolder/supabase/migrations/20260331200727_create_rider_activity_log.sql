/*
  # Rider Activity Log Table

  Creates the rider_activity_log table that was missing from the initial migration.
  Tracks all events per rider for a complete audit trail.
*/

CREATE TABLE IF NOT EXISTS rider_activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  description text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rider_activity_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_ral_rider_id ON rider_activity_log(rider_id);
CREATE INDEX IF NOT EXISTS idx_ral_created_at ON rider_activity_log(created_at DESC);

CREATE POLICY "Admins can select rider_activity_log"
  ON rider_activity_log FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert rider_activity_log"
  ON rider_activity_log FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

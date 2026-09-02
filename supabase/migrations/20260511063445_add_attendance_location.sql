/*
  # Add Attendance Location Table

  1. New Tables
    - `attendance_locations`
      - `id` (uuid, primary key)
      - `name` (text) - location label e.g. "Warehouse", "HQ"
      - `latitude` (numeric) - center lat
      - `longitude` (numeric) - center lng
      - `radius_meters` (integer) - allowed check-in radius in meters
      - `is_active` (boolean) - whether this location is currently active
      - `created_by` (uuid, FK profiles)
      - `created_at` / `updated_at`

  2. Security
    - Enable RLS
    - Admins can manage locations
    - Riders can read active locations (for distance check)
*/

CREATE TABLE IF NOT EXISTS attendance_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Main Location',
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  radius_meters integer NOT NULL DEFAULT 200,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE attendance_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage attendance locations"
  ON attendance_locations
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'rider'
  );

CREATE POLICY "Admins can insert attendance locations"
  ON attendance_locations
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Admins can update attendance locations"
  ON attendance_locations
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  );

CREATE POLICY "Admins can delete attendance locations"
  ON attendance_locations
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'super_admin')
  );

-- Allow riders to read active locations for GPS check
CREATE POLICY "Riders can read active locations"
  ON attendance_locations
  FOR SELECT
  TO authenticated
  USING (
    is_active = true
    AND (auth.jwt() -> 'app_metadata' ->> 'role') = 'rider'
  );

-- Also add check_in_location_id to rider_attendance to record which location was used
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_attendance' AND column_name = 'check_in_location_id'
  ) THEN
    ALTER TABLE rider_attendance ADD COLUMN check_in_location_id uuid REFERENCES attendance_locations(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_attendance' AND column_name = 'check_in_latitude'
  ) THEN
    ALTER TABLE rider_attendance ADD COLUMN check_in_latitude numeric(10, 7);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_attendance' AND column_name = 'check_in_longitude'
  ) THEN
    ALTER TABLE rider_attendance ADD COLUMN check_in_longitude numeric(10, 7);
  END IF;
END $$;

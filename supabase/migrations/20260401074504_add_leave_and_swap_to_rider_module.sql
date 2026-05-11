/*
  # Rider Leave Requests & Swap Tracking

  ## New Tables
  - `rider_leave_requests`
    - `id` (uuid, pk)
    - `rider_id` (uuid, fk → riders)
    - `leave_date` (date) — the specific day off
    - `reason` (text, nullable)
    - `status` (text) — 'pending' | 'approved' | 'rejected'
    - `requested_by` (uuid) — admin who created/approved
    - `notes` (text, nullable)
    - `created_at`, `updated_at`

  ## Modified Tables
  - `rider_order_assignments`
    - `swap_reason` (text, nullable) — why this assignment was reassigned
    - `swapped_from_rider_id` (uuid, nullable, fk → riders) — original rider before swap
    - `is_reassigned` (boolean, default false) — marks the original row as replaced

  ## Security
  - RLS enabled on rider_leave_requests
  - Admin-only policies (via profiles.role = 'admin')
*/

CREATE TABLE IF NOT EXISTS rider_leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  reason text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by uuid REFERENCES auth.users(id),
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rider_leave_requests_rider_date ON rider_leave_requests(rider_id, leave_date);
CREATE INDEX IF NOT EXISTS idx_rider_leave_requests_date_status ON rider_leave_requests(leave_date, status);

ALTER TABLE rider_leave_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all leave requests"
  ON rider_leave_requests FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert leave requests"
  ON rider_leave_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update leave requests"
  ON rider_leave_requests FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete leave requests"
  ON rider_leave_requests FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Add swap tracking columns to rider_order_assignments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_order_assignments' AND column_name = 'swap_reason'
  ) THEN
    ALTER TABLE rider_order_assignments ADD COLUMN swap_reason text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_order_assignments' AND column_name = 'swapped_from_rider_id'
  ) THEN
    ALTER TABLE rider_order_assignments ADD COLUMN swapped_from_rider_id uuid REFERENCES riders(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rider_order_assignments' AND column_name = 'is_reassigned'
  ) THEN
    ALTER TABLE rider_order_assignments ADD COLUMN is_reassigned boolean DEFAULT false;
  END IF;
END $$;

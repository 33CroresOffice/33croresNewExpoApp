/*
  # Rider Module Schema

  ## Overview
  Creates a complete delivery rider management system including rider profiles,
  order assignments, attendance tracking, performance metrics, and payout management.

  ## New Tables

  1. `riders`
     - Core rider profile linked to auth.users via profiles
     - Fields: id, profile_id (optional link to profiles), full_name, mobile, alternate_mobile,
       email, vehicle_type (bike/scooter/bicycle/foot), vehicle_number, license_number,
       zone, is_active, joining_date, address, emergency_contact_name, emergency_contact_mobile,
       profile_photo_url, daily_rate, per_delivery_rate, notes, created_at, updated_at
     - A rider is an internal staff record (not necessarily a Supabase auth user)

  2. `rider_order_assignments`
     - Links a rider to a specific order for delivery
     - Fields: id, rider_id, order_id, assigned_at, assigned_by, status (assigned/accepted/picked_up/delivered/failed/reassigned),
       accepted_at, picked_up_at, delivered_at, failed_at, failure_reason, distance_km,
       delivery_fee, notes, created_at, updated_at

  3. `rider_attendance`
     - Daily check-in/check-out records
     - Fields: id, rider_id, date, check_in_time, check_out_time, status (present/absent/half_day/leave),
       notes, recorded_by, created_at

  4. `rider_payouts`
     - Payout records per rider per period
     - Fields: id, rider_id, period_start, period_end, total_deliveries, total_days_worked,
       base_amount, delivery_bonus, deductions, final_amount, status (draft/approved/paid),
       payment_method (cash/upi/bank_transfer), payment_reference, paid_at, approved_by,
       created_by, notes, created_at, updated_at

  5. `rider_performance_snapshots`
     - Cached daily/weekly performance summaries per rider
     - Fields: id, rider_id, snapshot_date, deliveries_assigned, deliveries_completed,
       deliveries_failed, success_rate, avg_delivery_minutes, created_at

  ## Security
  - RLS enabled on all tables
  - Only admins can manage rider data
*/

-- ─── RIDERS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS riders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  full_name text NOT NULL,
  mobile text NOT NULL UNIQUE,
  alternate_mobile text,
  email text,
  vehicle_type text NOT NULL DEFAULT 'bike' CHECK (vehicle_type IN ('bike', 'scooter', 'bicycle', 'foot')),
  vehicle_number text,
  license_number text,
  zone text NOT NULL DEFAULT 'General',
  is_active boolean NOT NULL DEFAULT true,
  joining_date date NOT NULL DEFAULT CURRENT_DATE,
  address text NOT NULL DEFAULT '',
  emergency_contact_name text NOT NULL DEFAULT '',
  emergency_contact_mobile text NOT NULL DEFAULT '',
  profile_photo_url text,
  daily_rate integer NOT NULL DEFAULT 0,
  per_delivery_rate integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE riders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_riders_mobile ON riders(mobile);
CREATE INDEX IF NOT EXISTS idx_riders_is_active ON riders(is_active);
CREATE INDEX IF NOT EXISTS idx_riders_zone ON riders(zone);

CREATE POLICY "Admins can select riders"
  ON riders FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert riders"
  ON riders FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update riders"
  ON riders FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete riders"
  ON riders FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TRIGGER riders_updated_at
  BEFORE UPDATE ON riders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RIDER ORDER ASSIGNMENTS ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rider_order_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'accepted', 'picked_up', 'delivered', 'failed', 'reassigned')),
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  failure_reason text NOT NULL DEFAULT '',
  distance_km numeric(5,2),
  delivery_fee integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rider_order_assignments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_roa_rider_id ON rider_order_assignments(rider_id);
CREATE INDEX IF NOT EXISTS idx_roa_order_id ON rider_order_assignments(order_id);
CREATE INDEX IF NOT EXISTS idx_roa_status ON rider_order_assignments(status);
CREATE INDEX IF NOT EXISTS idx_roa_assigned_at ON rider_order_assignments(assigned_at DESC);

CREATE POLICY "Admins can select rider_order_assignments"
  ON rider_order_assignments FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert rider_order_assignments"
  ON rider_order_assignments FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update rider_order_assignments"
  ON rider_order_assignments FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete rider_order_assignments"
  ON rider_order_assignments FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TRIGGER rider_order_assignments_updated_at
  BEFORE UPDATE ON rider_order_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RIDER ATTENDANCE ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rider_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  date date NOT NULL,
  check_in_time timestamptz,
  check_out_time timestamptz,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present', 'absent', 'half_day', 'leave')),
  notes text NOT NULL DEFAULT '',
  recorded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rider_id, date)
);

ALTER TABLE rider_attendance ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rider_attendance_rider_id ON rider_attendance(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_attendance_date ON rider_attendance(date DESC);

CREATE POLICY "Admins can select rider_attendance"
  ON rider_attendance FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert rider_attendance"
  ON rider_attendance FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update rider_attendance"
  ON rider_attendance FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete rider_attendance"
  ON rider_attendance FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── RIDER PAYOUTS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rider_payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_deliveries integer NOT NULL DEFAULT 0,
  total_days_worked integer NOT NULL DEFAULT 0,
  base_amount integer NOT NULL DEFAULT 0,
  delivery_bonus integer NOT NULL DEFAULT 0,
  deductions integer NOT NULL DEFAULT 0,
  final_amount integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  payment_method text CHECK (payment_method IN ('cash', 'upi', 'bank_transfer')),
  payment_reference text NOT NULL DEFAULT '',
  paid_at timestamptz,
  approved_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rider_payouts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rider_payouts_rider_id ON rider_payouts(rider_id);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_status ON rider_payouts(status);
CREATE INDEX IF NOT EXISTS idx_rider_payouts_period ON rider_payouts(period_start DESC);

CREATE POLICY "Admins can select rider_payouts"
  ON rider_payouts FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert rider_payouts"
  ON rider_payouts FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update rider_payouts"
  ON rider_payouts FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete rider_payouts"
  ON rider_payouts FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE TRIGGER rider_payouts_updated_at
  BEFORE UPDATE ON rider_payouts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── RIDER PERFORMANCE SNAPSHOTS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS rider_performance_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  deliveries_assigned integer NOT NULL DEFAULT 0,
  deliveries_completed integer NOT NULL DEFAULT 0,
  deliveries_failed integer NOT NULL DEFAULT 0,
  success_rate numeric(5,2) NOT NULL DEFAULT 0,
  avg_delivery_minutes integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rider_id, snapshot_date)
);

ALTER TABLE rider_performance_snapshots ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rps_rider_id ON rider_performance_snapshots(rider_id);
CREATE INDEX IF NOT EXISTS idx_rps_snapshot_date ON rider_performance_snapshots(snapshot_date DESC);

CREATE POLICY "Admins can select rider_performance_snapshots"
  ON rider_performance_snapshots FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can insert rider_performance_snapshots"
  ON rider_performance_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

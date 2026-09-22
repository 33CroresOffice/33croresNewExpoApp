/*
# Add Incentive Criteria, Feedback, Quality Reports, and Rankings Tables

## Overview
Extends the rider incentives system to support automatic performance evaluation:
1. Adds configurable qualification criteria columns to `rider_incentives`
2. Adds `earned_amount` to `rider_incentive_evaluations` for storing calculated amounts
3. Creates `rider_customer_feedback` for admin-managed monthly feedback
4. Creates `rider_quality_reports` for riders to report poor flower quality
5. Creates `rider_monthly_rankings` for storing calculated monthly rankings

## Modified Tables

### rider_incentives (ALTER)
- `bonus_category` (text, nullable) — category tag: on_time_attendance, on_time_delivery, no_leave, customer_feedback, flower_quality, or custom
- `evaluation_basis` (text, nullable) — per_day or per_month (overrides `type` for evaluation logic)
- `cutoff_time` (text, nullable) — HH:MM format, used as the deadline for on-time checks
- `min_deliveries` (int, nullable) — minimum monthly deliveries to qualify
- `min_present_days` (int, nullable) — minimum present days to qualify
- `max_absent_days` (int, nullable) — maximum absent days allowed to qualify

### rider_incentive_evaluations (ALTER)
- `earned_amount` (numeric, default 0) — the calculated amount earned for per-day incentives

## New Tables

### rider_customer_feedback
- Stores admin-managed monthly customer feedback for riders
- Fields: id, rider_id, month (YYYY-MM), rating (positive/neutral/negative), notes, awarded_by (admin profile), created_at
- Used for Customer Feedback Bonus qualification

### rider_quality_reports
- Stores rider-submitted flower quality reports with photos
- Fields: id, rider_id, assignment_id (nullable), photo_url, notes, status (pending/reviewed), reviewed_by, created_at
- Riders can submit; admins can review

### rider_monthly_rankings
- Stores calculated monthly performance rankings
- Fields: id, rider_id, month, score, rank_position, total_earned, deliveries, present_days, absent_days, leave_days, on_time_attendance_days, on_time_delivery_days, created_at
- Unique on (rider_id, month)

## Security
- RLS enabled on all new tables
- rider_customer_feedback: admin-only CRUD
- rider_quality_reports: riders can insert their own; admins can read/update all
- rider_monthly_rankings: admin read all; riders read own; admin write (via function only)
*/

-- ═══ 1. Add criteria columns to rider_incentives ═══════════════════════════

ALTER TABLE rider_incentives
  ADD COLUMN IF NOT EXISTS bonus_category text,
  ADD COLUMN IF NOT EXISTS evaluation_basis text CHECK (evaluation_basis IS NULL OR evaluation_basis IN ('per_day', 'per_month')),
  ADD COLUMN IF NOT EXISTS cutoff_time text,
  ADD COLUMN IF NOT EXISTS min_deliveries integer,
  ADD COLUMN IF NOT EXISTS min_present_days integer,
  ADD COLUMN IF NOT EXISTS max_absent_days integer;

-- ═══ 2. Add earned_amount to rider_incentive_evaluations ═══════════════════

ALTER TABLE rider_incentive_evaluations
  ADD COLUMN IF NOT EXISTS earned_amount numeric(10, 2) NOT NULL DEFAULT 0;

-- ═══ 3. rider_customer_feedback ════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rider_customer_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  month text NOT NULL,
  rating text NOT NULL DEFAULT 'positive' CHECK (rating IN ('positive', 'neutral', 'negative')),
  notes text NOT NULL DEFAULT '',
  awarded_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rider_id, month)
);

ALTER TABLE rider_customer_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select rider_customer_feedback" ON rider_customer_feedback;
CREATE POLICY "Admins can select rider_customer_feedback"
  ON rider_customer_feedback FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert rider_customer_feedback" ON rider_customer_feedback;
CREATE POLICY "Admins can insert rider_customer_feedback"
  ON rider_customer_feedback FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update rider_customer_feedback" ON rider_customer_feedback;
CREATE POLICY "Admins can update rider_customer_feedback"
  ON rider_customer_feedback FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete rider_customer_feedback" ON rider_customer_feedback;
CREATE POLICY "Admins can delete rider_customer_feedback"
  ON rider_customer_feedback FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Riders can read own customer feedback" ON rider_customer_feedback;
CREATE POLICY "Riders can read own customer feedback"
  ON rider_customer_feedback FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = rider_customer_feedback.rider_id
      AND r.profile_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_rcf_rider_id ON rider_customer_feedback(rider_id);
CREATE INDEX IF NOT EXISTS idx_rcf_month ON rider_customer_feedback(month);

-- ═══ 4. rider_quality_reports ══════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rider_quality_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES rider_order_assignments(id) ON DELETE SET NULL,
  photo_url text,
  notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  reviewed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rider_quality_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select rider_quality_reports" ON rider_quality_reports;
CREATE POLICY "Admins can select rider_quality_reports"
  ON rider_quality_reports FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update rider_quality_reports" ON rider_quality_reports;
CREATE POLICY "Admins can update rider_quality_reports"
  ON rider_quality_reports FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Riders can insert own quality reports" ON rider_quality_reports;
CREATE POLICY "Riders can insert own quality reports"
  ON rider_quality_reports FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = rider_quality_reports.rider_id
      AND r.profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Riders can read own quality reports" ON rider_quality_reports;
CREATE POLICY "Riders can read own quality reports"
  ON rider_quality_reports FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = rider_quality_reports.rider_id
      AND r.profile_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_rqr_rider_id ON rider_quality_reports(rider_id);
CREATE INDEX IF NOT EXISTS idx_rqr_status ON rider_quality_reports(status);
CREATE INDEX IF NOT EXISTS idx_rqr_created_at ON rider_quality_reports(created_at);

-- ═══ 5. rider_monthly_rankings ═════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rider_monthly_rankings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  month text NOT NULL,
  score numeric(10, 2) NOT NULL DEFAULT 0,
  rank_position integer NOT NULL DEFAULT 0,
  total_earned numeric(10, 2) NOT NULL DEFAULT 0,
  deliveries integer NOT NULL DEFAULT 0,
  present_days integer NOT NULL DEFAULT 0,
  absent_days integer NOT NULL DEFAULT 0,
  leave_days integer NOT NULL DEFAULT 0,
  on_time_attendance_days integer NOT NULL DEFAULT 0,
  on_time_delivery_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rider_id, month)
);

ALTER TABLE rider_monthly_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select rider_monthly_rankings" ON rider_monthly_rankings;
CREATE POLICY "Admins can select rider_monthly_rankings"
  ON rider_monthly_rankings FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert rider_monthly_rankings" ON rider_monthly_rankings;
CREATE POLICY "Admins can insert rider_monthly_rankings"
  ON rider_monthly_rankings FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update rider_monthly_rankings" ON rider_monthly_rankings;
CREATE POLICY "Admins can update rider_monthly_rankings"
  ON rider_monthly_rankings FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Riders can read own rankings" ON rider_monthly_rankings;
CREATE POLICY "Riders can read own rankings"
  ON rider_monthly_rankings FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = rider_monthly_rankings.rider_id
      AND r.profile_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_rmr_month ON rider_monthly_rankings(month);
CREATE INDEX IF NOT EXISTS idx_rmr_rank ON rider_monthly_rankings(month, rank_position);

-- ═══ 6. Trigger for rider_quality_reports updated_at ═══════════════════════

CREATE OR REPLACE FUNCTION update_rider_quality_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_quality_reports_updated_at ON rider_quality_reports;
CREATE TRIGGER rider_quality_reports_updated_at
  BEFORE UPDATE ON rider_quality_reports
  FOR EACH ROW EXECUTE FUNCTION update_rider_quality_reports_updated_at();

-- ═══ 7. Trigger for rider_monthly_rankings updated_at ══════════════════════

CREATE OR REPLACE FUNCTION update_rider_monthly_rankings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_monthly_rankings_updated_at ON rider_monthly_rankings;
CREATE TRIGGER rider_monthly_rankings_updated_at
  BEFORE UPDATE ON rider_monthly_rankings
  FOR EACH ROW EXECUTE FUNCTION update_rider_monthly_rankings_updated_at();

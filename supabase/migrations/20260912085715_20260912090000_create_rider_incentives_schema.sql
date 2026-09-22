/*
# Rider Incentives Schema

## Overview
Creates a complete incentive management system for riders, including:
1. Incentive definitions (admin-managed)
2. Per-rider incentive evaluations for each month (admin marks Passed/Qualified)
3. A view for best performer calculation

## New Tables

### 1. rider_incentives
- Stores incentive definitions created by admin
- Fields: id, name (required), amount, type (per_day/per_month), is_active, created_at, updated_at

### 2. rider_incentive_evaluations
- Links a rider to an incentive for a specific month
- Admin marks each as passed/qualified
- Fields: id, rider_id, incentive_id, month (YYYY-MM), status (pending/passed/failed), qualified_at, qualified_by, notes, created_at, updated_at
- Unique constraint on (rider_id, incentive_id, month) to prevent duplicates

## Security
- RLS enabled on both tables
- Admin-only CRUD on rider_incentives (uses JWT app_metadata role check)
- Admin-only CRUD on rider_incentive_evaluations
- Riders can read their own qualified evaluations (to show in Rider App)
*/

-- ═══ 1. rider_incentives ════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rider_incentives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  amount numeric(10, 2) NOT NULL DEFAULT 0,
  type text NOT NULL DEFAULT 'per_day' CHECK (type IN ('per_day', 'per_month')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rider_incentives ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select rider_incentives" ON rider_incentives;
CREATE POLICY "Admins can select rider_incentives"
  ON rider_incentives FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert rider_incentives" ON rider_incentives;
CREATE POLICY "Admins can insert rider_incentives"
  ON rider_incentives FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update rider_incentives" ON rider_incentives;
CREATE POLICY "Admins can update rider_incentives"
  ON rider_incentives FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete rider_incentives" ON rider_incentives;
CREATE POLICY "Admins can delete rider_incentives"
  ON rider_incentives FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Riders can read active incentives to see what's available
DROP POLICY IF EXISTS "Riders can select active rider_incentives" ON rider_incentives;
CREATE POLICY "Riders can select active rider_incentives"
  ON rider_incentives FOR SELECT TO authenticated
  USING (is_active = true);

CREATE INDEX IF NOT EXISTS idx_rider_incentives_active ON rider_incentives(is_active);

-- ═══ 2. rider_incentive_evaluations ═════════════════════════════════════════

CREATE TABLE IF NOT EXISTS rider_incentive_evaluations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  incentive_id uuid NOT NULL REFERENCES rider_incentives(id) ON DELETE CASCADE,
  month text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed', 'failed')),
  qualified_at timestamptz,
  qualified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rider_id, incentive_id, month)
);

ALTER TABLE rider_incentive_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can select rider_incentive_evaluations" ON rider_incentive_evaluations;
CREATE POLICY "Admins can select rider_incentive_evaluations"
  ON rider_incentive_evaluations FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert rider_incentive_evaluations" ON rider_incentive_evaluations;
CREATE POLICY "Admins can insert rider_incentive_evaluations"
  ON rider_incentive_evaluations FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update rider_incentive_evaluations" ON rider_incentive_evaluations;
CREATE POLICY "Admins can update rider_incentive_evaluations"
  ON rider_incentive_evaluations FOR UPDATE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete rider_incentive_evaluations" ON rider_incentive_evaluations;
CREATE POLICY "Admins can delete rider_incentive_evaluations"
  ON rider_incentive_evaluations FOR DELETE TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Riders can read their own evaluations (to see qualified incentives in Rider App)
DROP POLICY IF EXISTS "Riders can select own incentive evaluations" ON rider_incentive_evaluations;
CREATE POLICY "Riders can select own incentive evaluations"
  ON rider_incentive_evaluations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM riders r
      WHERE r.id = rider_incentive_evaluations.rider_id
      AND r.profile_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_rie_rider_id ON rider_incentive_evaluations(rider_id);
CREATE INDEX IF NOT EXISTS idx_rie_incentive_id ON rider_incentive_evaluations(incentive_id);
CREATE INDEX IF NOT EXISTS idx_rie_month ON rider_incentive_evaluations(month);
CREATE INDEX IF NOT EXISTS idx_rie_status ON rider_incentive_evaluations(status);

-- ═══ 3. Triggers for updated_at ═══════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_rider_incentives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS rider_incentives_updated_at ON rider_incentives;
CREATE TRIGGER rider_incentives_updated_at
  BEFORE UPDATE ON rider_incentives
  FOR EACH ROW EXECUTE FUNCTION update_rider_incentives_updated_at();

DROP TRIGGER IF EXISTS rider_incentive_evaluations_updated_at ON rider_incentive_evaluations;
CREATE TRIGGER rider_incentive_evaluations_updated_at
  BEFORE UPDATE ON rider_incentive_evaluations
  FOR EACH ROW EXECUTE FUNCTION update_rider_incentives_updated_at();

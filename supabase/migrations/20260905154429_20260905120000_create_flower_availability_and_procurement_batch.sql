/*
# Flower Availability Calendar & Procurement Batch Workflow

## Overview
This migration adds two new capabilities:
1. **Flower Availability Calendar** - Mark flowers as unavailable for specific date ranges
   and assign alternate substitute flowers for those periods.
2. **Procurement Batch Workflow** - An approval-and-vendor-assignment step between
   daily requirements and procurement orders. Admin reviews generated requirements,
   edits if needed, assigns each flower to a specific vendor, then approves and pushes
   frozen procurement orders to vendors.

## New Tables

### 1. flower_availability
Tracks date ranges when a flower is unavailable and its designated alternate.
- `flower_type_id` - FK to flower_types (the unavailable flower)
- `unavailable_from` / `unavailable_to` - date range of unavailability
- `alternate_flower_type_id` - FK to flower_types (the substitute), nullable
- `alternate_quantity` / `alternate_unit_type` - quantity and unit for the substitute
- `reason` - optional text reason

### 2. procurement_batches
Represents a batch of daily requirements that have been reviewed and approved.
- `batch_number` - auto-generated (PB-0001 format)
- `requirement_date` - the delivery date this batch covers
- `status` - draft / approved / pushed
- `approved_by` / `approved_at` - who approved and when

### 3. procurement_batch_items
Individual flower requirement lines within a batch, with vendor assignment.
- `batch_id` - FK to procurement_batches
- `flower_type_id` - the (possibly substituted) flower
- `quantity` / `unit_type` - the amount needed
- `original_flower_type_id` - if substitution was applied, the original flower
- `vendor_id` - assigned vendor
- `procurement_order_id` - set when pushed to vendor

## Modified Tables
- `daily_requirements` - Added `batch_id`, `original_flower_type_id`, `substituted` columns.

## Security
- All new tables have RLS enabled.
- `flower_availability` readable by all authenticated users; admin-only writes.
- `procurement_batches` and `procurement_batch_items` admin-only; vendors can read
  their assigned items once the batch is pushed.
- `is_admin()` SECURITY DEFINER function already exists.
*/

-- ===== Sequence for batch numbers =====
CREATE SEQUENCE IF NOT EXISTS procurement_batch_seq START 1;

-- ===== flower_availability =====
CREATE TABLE IF NOT EXISTS flower_availability (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flower_type_id            uuid NOT NULL REFERENCES flower_types(id) ON DELETE CASCADE,
  unavailable_from          date NOT NULL,
  unavailable_to            date NOT NULL,
  alternate_flower_type_id  uuid REFERENCES flower_types(id) ON DELETE SET NULL,
  alternate_quantity        numeric(10,2),
  alternate_unit_type       text,
  reason                    text,
  created_by                uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CHECK (unavailable_to >= unavailable_from)
);

ALTER TABLE flower_availability ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view flower_availability" ON flower_availability;
CREATE POLICY "Authenticated can view flower_availability" ON flower_availability FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can insert flower_availability" ON flower_availability;
CREATE POLICY "Admin can insert flower_availability" ON flower_availability FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can update flower_availability" ON flower_availability;
CREATE POLICY "Admin can update flower_availability" ON flower_availability FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can delete flower_availability" ON flower_availability;
CREATE POLICY "Admin can delete flower_availability" ON flower_availability FOR DELETE
  TO authenticated USING (is_admin());

-- ===== procurement_batches =====
CREATE TABLE IF NOT EXISTS procurement_batches (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number      text UNIQUE NOT NULL DEFAULT ('PB-' || LPAD(nextval('procurement_batch_seq')::text, 4, '0')),
  requirement_date  date NOT NULL,
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','pushed')),
  approved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at       timestamptz,
  notes             text,
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE procurement_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view procurement_batches" ON procurement_batches;
CREATE POLICY "Admin can view procurement_batches" ON procurement_batches FOR SELECT
  TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "Admin can insert procurement_batches" ON procurement_batches;
CREATE POLICY "Admin can insert procurement_batches" ON procurement_batches FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can update procurement_batches" ON procurement_batches;
CREATE POLICY "Admin can update procurement_batches" ON procurement_batches FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can delete procurement_batches" ON procurement_batches;
CREATE POLICY "Admin can delete procurement_batches" ON procurement_batches FOR DELETE
  TO authenticated USING (is_admin());

-- ===== procurement_batch_items =====
CREATE TABLE IF NOT EXISTS procurement_batch_items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id                  uuid NOT NULL REFERENCES procurement_batches(id) ON DELETE CASCADE,
  flower_type_id            uuid NOT NULL REFERENCES flower_types(id) ON DELETE RESTRICT,
  quantity                  numeric(10,2) NOT NULL DEFAULT 0,
  unit_type                 text,
  original_flower_type_id   uuid REFERENCES flower_types(id) ON DELETE SET NULL,
  vendor_id                 uuid REFERENCES vendors(id) ON DELETE SET NULL,
  procurement_order_id      uuid REFERENCES procurement_orders(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE procurement_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can view procurement_batch_items" ON procurement_batch_items;
CREATE POLICY "Admin can view procurement_batch_items" ON procurement_batch_items FOR SELECT
  TO authenticated USING (is_admin() OR EXISTS (
    SELECT 1 FROM procurement_batches pb
    WHERE pb.id = procurement_batch_items.batch_id
    AND pb.status = 'pushed'
    AND procurement_batch_items.vendor_id IN (
      SELECT v.id FROM vendors v WHERE v.user_id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "Admin can insert procurement_batch_items" ON procurement_batch_items;
CREATE POLICY "Admin can insert procurement_batch_items" ON procurement_batch_items FOR INSERT
  TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can update procurement_batch_items" ON procurement_batch_items;
CREATE POLICY "Admin can update procurement_batch_items" ON procurement_batch_items FOR UPDATE
  TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "Admin can delete procurement_batch_items" ON procurement_batch_items;
CREATE POLICY "Admin can delete procurement_batch_items" ON procurement_batch_items FOR DELETE
  TO authenticated USING (is_admin());

-- ===== Add columns to daily_requirements =====
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_requirements' AND column_name = 'batch_id'
  ) THEN
    ALTER TABLE daily_requirements ADD COLUMN batch_id uuid REFERENCES procurement_batches(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_requirements' AND column_name = 'original_flower_type_id'
  ) THEN
    ALTER TABLE daily_requirements ADD COLUMN original_flower_type_id uuid REFERENCES flower_types(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'daily_requirements' AND column_name = 'substituted'
  ) THEN
    ALTER TABLE daily_requirements ADD COLUMN substituted boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ===== Re-apply daily_requirements policies (idempotent) =====
DROP POLICY IF EXISTS "Admins can view daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can insert daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can update daily requirements" ON daily_requirements;
DROP POLICY IF EXISTS "Admins can delete daily requirements" ON daily_requirements;
CREATE POLICY "Admins can view daily requirements" ON daily_requirements FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "Admins can insert daily requirements" ON daily_requirements FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins can update daily requirements" ON daily_requirements FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Admins can delete daily requirements" ON daily_requirements FOR DELETE TO authenticated USING (is_admin());

-- ===== Indexes =====
CREATE INDEX IF NOT EXISTS idx_flower_availability_flower_type ON flower_availability(flower_type_id);
CREATE INDEX IF NOT EXISTS idx_flower_availability_dates ON flower_availability(unavailable_from, unavailable_to);
CREATE INDEX IF NOT EXISTS idx_procurement_batches_date ON procurement_batches(requirement_date);
CREATE INDEX IF NOT EXISTS idx_procurement_batches_status ON procurement_batches(status);
CREATE INDEX IF NOT EXISTS idx_procurement_batch_items_batch ON procurement_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_procurement_batch_items_vendor ON procurement_batch_items(vendor_id);
CREATE INDEX IF NOT EXISTS idx_daily_requirements_batch ON daily_requirements(batch_id);

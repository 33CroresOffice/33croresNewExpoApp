/*
# Create vendor_flowers table

1. Purpose
- Lets each vendor record which flower types they can supply, along with a per-unit supply price.
- This is used on the vendor detail page's "Flowers" tab so admins can manage a vendor's flower catalog and pricing.

2. New Tables
- `vendor_flowers`
  - `id` (uuid, primary key)
  - `vendor_id` (uuid, references vendors, on delete cascade)
  - `flower_type_id` (uuid, references flower_types, on delete cascade)
  - `unit_type` (text, the unit the vendor supplies this flower in — kg, bunch, pieces, etc.)
  - `price_per_unit` (numeric, the vendor's supply price per unit)
  - `is_active` (boolean, default true — lets admins disable a flower without deleting the row)
  - `notes` (text, nullable, optional notes about this supply line)
  - `created_at` (timestamptz, default now)
  - `updated_at` (timestamptz, default now)
  - Unique constraint on (vendor_id, flower_type_id) so each vendor has one price row per flower type.

3. Indexes
- `vendor_flowers_vendor_id_idx` on vendor_id for fast vendor-scoped lookups.
- `vendor_flowers_flower_type_id_idx` on flower_type_id for reverse lookups.

4. Security
- Enable RLS on `vendor_flowers`.
- Admin (role = admin in raw_app_meta_data) gets full CRUD.
- Vendors can read their own supply rows (scoped by vendor -> user_id).
- Uses the same JWT-based admin pattern as the rest of the schema (raw_app_meta_data ->> 'role' = 'admin').

5. Notes
- `price_per_unit` is numeric(12,2) to support paise-level precision without floating-point drift.
- `unit_type` is text (not enum-constrained) to match the existing flower_types.unit_type column which is also text.
- The trigger updates updated_at automatically on row update.
*/

CREATE TABLE IF NOT EXISTS vendor_flowers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
  flower_type_id uuid NOT NULL REFERENCES flower_types(id) ON DELETE CASCADE,
  unit_type text,
  price_per_unit numeric(12,2) NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vendor_flowers_vendor_flower_unique UNIQUE (vendor_id, flower_type_id)
);

CREATE INDEX IF NOT EXISTS vendor_flowers_vendor_id_idx ON vendor_flowers(vendor_id);
CREATE INDEX IF NOT EXISTS vendor_flowers_flower_type_id_idx ON vendor_flowers(flower_type_id);

ALTER TABLE vendor_flowers ENABLE ROW LEVEL SECURITY;

-- Admin full access (role stored in JWT app metadata)
DROP POLICY IF EXISTS "admin_select_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_select_vendor_flowers" ON vendor_flowers FOR SELECT
  TO authenticated USING (
    (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "admin_insert_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_insert_vendor_flowers" ON vendor_flowers FOR INSERT
  TO authenticated WITH CHECK (
    (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "admin_update_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_update_vendor_flowers" ON vendor_flowers FOR UPDATE
  TO authenticated USING (
    (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  ) WITH CHECK (
    (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS "admin_delete_vendor_flowers" ON vendor_flowers;
CREATE POLICY "admin_delete_vendor_flowers" ON vendor_flowers FOR DELETE
  TO authenticated USING (
    (auth.jwt() -> 'raw_app_meta_data' ->> 'role') = 'admin'
  );

-- Vendors can read their own supply rows
DROP POLICY IF EXISTS "vendor_read_own_flowers" ON vendor_flowers;
CREATE POLICY "vendor_read_own_flowers" ON vendor_flowers FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM vendors v
      WHERE v.id = vendor_flowers.vendor_id
      AND v.user_id = auth.uid()
    )
  );

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION update_vendor_flowers_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS vendor_flowers_updated_at ON vendor_flowers;
CREATE TRIGGER vendor_flowers_updated_at
  BEFORE UPDATE ON vendor_flowers
  FOR EACH ROW
  EXECUTE FUNCTION update_vendor_flowers_updated_at();

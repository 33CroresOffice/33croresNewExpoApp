/*
  # Vendor & Procurement Schema

  ## Summary
  Adds the complete procurement and vendor management infrastructure to support
  flower sourcing operations for the subscription bouquet business.

  ## New Tables
  - flower_types: Master flower variety catalog
  - plan_flower_requirements: Per-plan flower quantities per delivery
  - vendors: Flower supplier records with banking/contact details
  - daily_requirements: Auto-generated daily flower procurement needs
  - procurement_orders: Purchase orders sent to vendors
  - procurement_order_items: Line items within purchase orders
  - vendor_payments: Payment records against procurement orders
  - warehouse_receipts: Goods-received records
  - warehouse_receipt_items: Per-flower verification of received goods

  ## Security
  - RLS enabled on all tables
  - Admin has full CRUD access
  - Vendors can read their own linked records

  ## Notes
  1. order_number auto-generates PO-0001 style identifiers via a sequence
  2. has_discrepancy in warehouse_receipt_items is a generated boolean column
  3. subscription_plans gets a sort_order column for UI ordering
*/

-- ─── Add sort_order to subscription_plans ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscription_plans' AND column_name = 'sort_order'
  ) THEN
    ALTER TABLE subscription_plans ADD COLUMN sort_order integer DEFAULT 0 NOT NULL;
  END IF;
END $$;

-- ─── flower_types ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flower_types (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text UNIQUE NOT NULL,
  display_name text NOT NULL,
  unit_type    text NOT NULL DEFAULT 'bunch' CHECK (unit_type IN ('kg','pieces','bunch')),
  description  text,
  image_url    text,
  is_active    boolean NOT NULL DEFAULT true,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE flower_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select flower_types"
  ON flower_types FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert flower_types"
  ON flower_types FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update flower_types"
  ON flower_types FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete flower_types"
  ON flower_types FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- Seed common flower types
INSERT INTO flower_types (name, display_name, unit_type, sort_order) VALUES
  ('roses',       'Roses',                'pieces', 1),
  ('lilies',      'Lilies',               'pieces', 2),
  ('carnations',  'Carnations',           'pieces', 3),
  ('gerbera',     'Gerbera',              'pieces', 4),
  ('chrysanthemum','Chrysanthemum',       'bunch',  5),
  ('tuberose',    'Tuberose',             'bunch',  6),
  ('orchids',     'Orchids',              'pieces', 7),
  ('sunflowers',  'Sunflowers',           'pieces', 8),
  ('greens',      'Greens / Foliage',     'bunch',  9)
ON CONFLICT DO NOTHING;

-- ─── plan_flower_requirements ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plan_flower_requirements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id               uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  flower_type_id        uuid NOT NULL REFERENCES flower_types(id) ON DELETE CASCADE,
  quantity_per_delivery numeric(10,2) NOT NULL DEFAULT 1,
  unit_type             text NOT NULL DEFAULT 'bunch' CHECK (unit_type IN ('kg','pieces','bunch')),
  created_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, flower_type_id)
);

ALTER TABLE plan_flower_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select plan_flower_requirements"
  ON plan_flower_requirements FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert plan_flower_requirements"
  ON plan_flower_requirements FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update plan_flower_requirements"
  ON plan_flower_requirements FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete plan_flower_requirements"
  ON plan_flower_requirements FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─── vendors ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_name       text,
  contact_person      text,
  mobile              text,
  whatsapp            text,
  email               text,
  address             text,
  city                text,
  gstin               text,
  bank_account_number text,
  bank_ifsc           text,
  bank_account_name   text,
  upi_id              text,
  is_active           boolean NOT NULL DEFAULT true,
  notes               text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select vendors"
  ON vendors FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert vendors"
  ON vendors FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update vendors"
  ON vendors FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete vendors"
  ON vendors FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Vendor reads own record"
  ON vendors FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- ─── daily_requirements ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_requirements (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requirement_date           date NOT NULL,
  flower_type_id             uuid NOT NULL REFERENCES flower_types(id) ON DELETE CASCADE,
  total_quantity             numeric(10,2) NOT NULL DEFAULT 0,
  unit_type                  text CHECK (unit_type IN ('kg','pieces','bunch')),
  active_subscriptions_count integer NOT NULL DEFAULT 0,
  status                     text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ordered','fulfilled')),
  procurement_order_id       uuid,
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (requirement_date, flower_type_id)
);

ALTER TABLE daily_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select daily_requirements"
  ON daily_requirements FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert daily_requirements"
  ON daily_requirements FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update daily_requirements"
  ON daily_requirements FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete daily_requirements"
  ON daily_requirements FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─── procurement_orders ──────────────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS procurement_order_seq START 1;

CREATE TABLE IF NOT EXISTS procurement_orders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     text UNIQUE NOT NULL DEFAULT ('PO-' || LPAD(nextval('procurement_order_seq')::text, 4, '0')),
  vendor_id        uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  order_date       date DEFAULT CURRENT_DATE,
  requirement_date date,
  status           text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','fulfilled','cancelled')),
  total_amount     numeric(12,2) NOT NULL DEFAULT 0,
  notes            text,
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE procurement_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select procurement_orders"
  ON procurement_orders FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert procurement_orders"
  ON procurement_orders FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update procurement_orders"
  ON procurement_orders FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete procurement_orders"
  ON procurement_orders FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Vendor reads own procurement_orders"
  ON procurement_orders FOR SELECT
  TO authenticated
  USING (
    vendor_id IN (SELECT id FROM vendors WHERE user_id = auth.uid())
  );

-- ─── procurement_order_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS procurement_order_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_order_id  uuid NOT NULL REFERENCES procurement_orders(id) ON DELETE CASCADE,
  flower_type_id        uuid NOT NULL REFERENCES flower_types(id) ON DELETE RESTRICT,
  quantity              numeric(10,2) NOT NULL DEFAULT 1,
  unit_type             text CHECK (unit_type IN ('kg','pieces','bunch')),
  price_per_unit        numeric(10,2),
  total_price           numeric(12,2) GENERATED ALWAYS AS (quantity * COALESCE(price_per_unit, 0)) STORED,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE procurement_order_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select procurement_order_items"
  ON procurement_order_items FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert procurement_order_items"
  ON procurement_order_items FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update procurement_order_items"
  ON procurement_order_items FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete procurement_order_items"
  ON procurement_order_items FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Vendor reads items for their orders"
  ON procurement_order_items FOR SELECT
  TO authenticated
  USING (
    procurement_order_id IN (
      SELECT po.id FROM procurement_orders po
      JOIN vendors v ON v.id = po.vendor_id
      WHERE v.user_id = auth.uid()
    )
  );

-- ─── vendor_payments ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendor_payments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_order_id  uuid NOT NULL REFERENCES procurement_orders(id) ON DELETE RESTRICT,
  vendor_id             uuid NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
  amount                numeric(12,2) NOT NULL,
  payment_date          date NOT NULL DEFAULT CURRENT_DATE,
  payment_method        text NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash','upi','bank_transfer','cheque')),
  transaction_id        text,
  status                text NOT NULL DEFAULT 'completed' CHECK (status IN ('pending','completed','failed')),
  notes                 text,
  recorded_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select vendor_payments"
  ON vendor_payments FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert vendor_payments"
  ON vendor_payments FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update vendor_payments"
  ON vendor_payments FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete vendor_payments"
  ON vendor_payments FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─── warehouse_receipts ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_receipts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procurement_order_id  uuid NOT NULL REFERENCES procurement_orders(id) ON DELETE RESTRICT,
  received_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  received_at           timestamptz NOT NULL DEFAULT now(),
  status                text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete','partial','rejected')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE warehouse_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select warehouse_receipts"
  ON warehouse_receipts FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert warehouse_receipts"
  ON warehouse_receipts FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update warehouse_receipts"
  ON warehouse_receipts FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete warehouse_receipts"
  ON warehouse_receipts FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─── warehouse_receipt_items ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouse_receipt_items (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_receipt_id  uuid NOT NULL REFERENCES warehouse_receipts(id) ON DELETE CASCADE,
  flower_type_id        uuid NOT NULL REFERENCES flower_types(id) ON DELETE RESTRICT,
  ordered_quantity      numeric(10,2) NOT NULL DEFAULT 0,
  received_quantity     numeric(10,2) NOT NULL DEFAULT 0,
  unit_type             text CHECK (unit_type IN ('kg','pieces','bunch')),
  has_discrepancy       boolean GENERATED ALWAYS AS (received_quantity <> ordered_quantity) STORED,
  notes                 text
);

ALTER TABLE warehouse_receipt_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin select warehouse_receipt_items"
  ON warehouse_receipt_items FOR SELECT
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin insert warehouse_receipt_items"
  ON warehouse_receipt_items FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin update warehouse_receipt_items"
  ON warehouse_receipt_items FOR UPDATE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admin delete warehouse_receipt_items"
  ON warehouse_receipt_items FOR DELETE
  TO authenticated
  USING ((SELECT role FROM profiles WHERE id = auth.uid()) = 'admin');

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_daily_req_date     ON daily_requirements(requirement_date);
CREATE INDEX IF NOT EXISTS idx_daily_req_status   ON daily_requirements(status);
CREATE INDEX IF NOT EXISTS idx_proc_orders_vendor ON procurement_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_proc_orders_status ON procurement_orders(status);
CREATE INDEX IF NOT EXISTS idx_proc_orders_req    ON procurement_orders(requirement_date);
CREATE INDEX IF NOT EXISTS idx_vend_pay_vendor    ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vend_pay_po        ON vendor_payments(procurement_order_id);
CREATE INDEX IF NOT EXISTS idx_wh_receipts_po     ON warehouse_receipts(procurement_order_id);

/*
# Create Pooja Items Delivery Segment

## Summary
Adds a new "Pooja Items" product line alongside the existing flower subscription
plans. Customers can subscribe to pooja packages (recurring delivery) or purchase
them as one-time orders for specific occasions. Admins manage a master catalogue
of pooja items and assemble packages from that library.

## Changes to Existing Tables
- `subscription_plans`: adds `product_type` column ('flower' | 'pooja', default
  'flower') and `supports_one_time` boolean (default false) to indicate whether
  a plan also supports one-time purchases. All existing plans backfilled as
  'flower'.

## New Tables
1. `pooja_items` - Master catalogue of pooja items (e.g. incense sticks, camphor,
   sacred thread). Admins maintain this reusable library.
   - id, name, description, unit_type, image_url, is_active, sort_order, timestamps

2. `plan_pooja_items` - Join table linking pooja plans to master catalogue items
   with a quantity per delivery. Mirrors `plan_flower_requirements`.
   - plan_id (FK → subscription_plans, CASCADE), pooja_item_id (FK → pooja_items,
     CASCADE), quantity_per_delivery, unit_type, PRIMARY KEY (plan_id, pooja_item_id)

3. `pooja_orders` - One-time pooja purchases for specific occasions. Modeled on
   the existing `custom_orders` table.
   - id, user_id (FK → auth.users, CASCADE), plan_id (FK → subscription_plans),
     delivery_date, delivery_time, address_id (FK → addresses, SET NULL),
     special_instructions, status, payment_status, price, delivery_price,
     total_price, razorpay_order_id, razorpay_payment_id, admin_note, timestamps

## Security
- RLS enabled on all new tables.
- `pooja_items`: public read for active items (authenticated); admin full CRUD
  via JWT app_metadata role check.
- `plan_pooja_items`: public read (authenticated); admin insert/delete via JWT
  app_metadata role check.
- `pooja_orders`: customers can insert/select/update their own orders; admins
  can select/update all orders via JWT app_metadata role check.

## Important Notes
1. The `product_type` column uses a CHECK constraint limited to 'flower' and
   'pooja'. Existing plans are backfilled to 'flower' so no current data is
   affected.
2. `supports_one_time` defaults to false so existing flower plans are unaffected.
3. Pooja subscription orders flow through the existing `orders` table and
   delivery system automatically — no new order table needed for subscriptions.
4. One-time pooja purchases use the new `pooja_orders` table, separate from
   `custom_orders` (which handles ad-hoc flower/garland orders).
*/

-- ─── ADD product_type AND supports_one_time TO subscription_plans ────────────

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'flower'
  CHECK (product_type IN ('flower', 'pooja'));

ALTER TABLE subscription_plans
  ADD COLUMN IF NOT EXISTS supports_one_time boolean NOT NULL DEFAULT false;

-- ─── POOJA ITEMS MASTER CATALOGUE ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pooja_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  unit_type text NOT NULL DEFAULT 'pieces',
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pooja_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pooja_items_active ON pooja_items(is_active, sort_order);

-- Public can read active items; admins can read all and manage everything
DROP POLICY IF EXISTS "Anyone can view active pooja items" ON pooja_items;
CREATE POLICY "Anyone can view active pooja items"
  ON pooja_items FOR SELECT
  TO authenticated
  USING (is_active = true OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert pooja items" ON pooja_items;
CREATE POLICY "Admins can insert pooja items"
  ON pooja_items FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update pooja items" ON pooja_items;
CREATE POLICY "Admins can update pooja items"
  ON pooja_items FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete pooja items" ON pooja_items;
CREATE POLICY "Admins can delete pooja items"
  ON pooja_items FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── PLAN POOJA ITEMS JOIN TABLE ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_pooja_items (
  plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  pooja_item_id uuid NOT NULL REFERENCES pooja_items(id) ON DELETE CASCADE,
  quantity_per_delivery numeric NOT NULL DEFAULT 1,
  unit_type text NOT NULL DEFAULT 'pieces',
  PRIMARY KEY (plan_id, pooja_item_id)
);

ALTER TABLE plan_pooja_items ENABLE ROW LEVEL SECURITY;

-- Public can read; admins can manage
DROP POLICY IF EXISTS "Anyone can view plan pooja items" ON plan_pooja_items;
CREATE POLICY "Anyone can view plan pooja items"
  ON plan_pooja_items FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert plan pooja items" ON plan_pooja_items;
CREATE POLICY "Admins can insert plan pooja items"
  ON plan_pooja_items FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update plan pooja items" ON plan_pooja_items;
CREATE POLICY "Admins can update plan pooja items"
  ON plan_pooja_items FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete plan pooja items" ON plan_pooja_items;
CREATE POLICY "Admins can delete plan pooja items"
  ON plan_pooja_items FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── POOJA ORDERS (ONE-TIME PURCHASES) ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pooja_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  delivery_date date NOT NULL,
  delivery_time text NOT NULL DEFAULT '',
  address_id uuid REFERENCES addresses(id) ON DELETE SET NULL,
  special_instructions text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'paid', 'out_for_delivery', 'delivered', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid', 'pending', 'paid')),
  price integer NOT NULL DEFAULT 0,
  delivery_price integer NOT NULL DEFAULT 0,
  total_price integer NOT NULL DEFAULT 0,
  razorpay_order_id text,
  razorpay_payment_id text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pooja_orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pooja_orders_user_id ON pooja_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_pooja_orders_delivery_date ON pooja_orders(delivery_date);
CREATE INDEX IF NOT EXISTS idx_pooja_orders_status ON pooja_orders(status);

-- Customers can manage their own orders; admins can see and update all
DROP POLICY IF EXISTS "Customers can insert own pooja orders" ON pooja_orders;
CREATE POLICY "Customers can insert own pooja orders"
  ON pooja_orders FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Customers can view own pooja orders" ON pooja_orders;
CREATE POLICY "Customers can view own pooja orders"
  ON pooja_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Customers can update own pooja orders" ON pooja_orders;
CREATE POLICY "Customers can update own pooja orders"
  ON pooja_orders FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK (auth.uid() = user_id OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── TRIGGER: updated_at on pooja_items ───────────────────────────────────────

CREATE OR REPLACE FUNCTION update_pooja_items_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pooja_items_updated_at ON pooja_items;
CREATE TRIGGER pooja_items_updated_at
  BEFORE UPDATE ON pooja_items
  FOR EACH ROW EXECUTE FUNCTION update_pooja_items_updated_at();

-- ─── TRIGGER: updated_at on pooja_orders ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_pooja_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pooja_orders_updated_at ON pooja_orders;
CREATE TRIGGER pooja_orders_updated_at
  BEFORE UPDATE ON pooja_orders
  FOR EACH ROW EXECUTE FUNCTION update_pooja_orders_updated_at();

-- ─── SEED SAMPLE POOJA ITEMS ──────────────────────────────────────────────────

INSERT INTO pooja_items (name, description, unit_type, sort_order)
VALUES
  ('Incense Sticks (Agarbatti)', 'Fragrant incense sticks for daily pooja', 'packet', 1),
  ('Camphor (Kapoor)', 'Camphor tablets for aarti', 'packet', 2),
  ('Sacred Thread (Mauli)', 'Red kalawa thread for wrist tying', 'pieces', 3),
  ('Cotton Wicks (Rui Baati)', 'Cotton wicks for lamp lighting', 'pieces', 4),
  ('Ghee Diya', 'Pre-filled ghee lamp for aarti', 'pieces', 5),
  ('Sandalwood Paste (Chandan)', 'Sandalwood paste for tilak', 'packet', 6),
  ('Rose Petals', 'Fresh rose petals for decoration', 'bunch', 7),
  ('Marigold Garland', 'Fresh marigold flower garland', 'pieces', 8),
  ('Pooja Thali Set', 'Complete thali with diya, bell, and kalash', 'pieces', 9),
  ('Holy Water (Ganga Jal)', 'Bottled Ganga water for abhishek', 'ml', 10),
  ('Kumkum and Haldi', 'Kumkum and turmeric powder set', 'packet', 11),
  ('Betel Leaf and Nut (Paan)', 'Betel leaves with nut for offering', 'pieces', 12)
ON CONFLICT DO NOTHING;

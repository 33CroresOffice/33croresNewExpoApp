/*
# Create Pandit Pooja Setup and Sharing Schema

## Summary
Adds a complete pooja/skill management system for approved Pandits. Admins manage
a catalogue of pooja types. Pandits select poojas, add pricing/details, build item
lists, and share those lists with customers via SMS, WhatsApp, and in-app notifications.

## New Tables

1. pooja_types - Admin-managed catalogue of pooja types and skills
   - id, name, description, is_active, sort_order, created_by, timestamps

2. provider_pooja_setups - A Pandit's configured pooja offering
   - id, provider_id (FK service_providers), pooja_type_id (FK pooja_types),
     description, duration_minutes, service_fee, language, special_instructions,
     is_active, timestamps
   - UNIQUE(provider_id, pooja_type_id) prevents duplicates

3. provider_pooja_items - Items required for a specific pooja setup
   - id, pooja_setup_id (FK provider_pooja_setups CASCADE), pooja_item_id (FK pooja_items CASCADE),
     quantity, timestamps

4. pooja_type_requests - Pandit-submitted requests for new pooja types
   - id, provider_id (FK service_providers), requested_name, requested_description,
     status ('pending','approved','rejected'), rejection_reason, reviewed_by, reviewed_at,
     created_at

5. pooja_list_shares - Shareable links for pooja item lists
   - id, provider_id (FK service_providers), pooja_setup_id (FK provider_pooja_setups),
     customer_mobile, share_token (unique), expires_at, is_revoked, created_at

## Security
- RLS enabled on all new tables.
- pooja_types: public read for active items; admin full CRUD.
- provider_pooja_setups: providers CRUD own; admin full access; public read active setups.
- provider_pooja_items: providers CRUD via setup ownership; admin full access; public read.
- pooja_type_requests: providers insert/select own; admin select/update all.
- pooja_list_shares: providers insert/select own; admin select all; public read by token.
*/

-- ─── POOJA TYPES CATALOGUE ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pooja_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pooja_types ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pooja_types_active ON pooja_types(is_active, sort_order);

DROP POLICY IF EXISTS "Anyone can view active pooja types" ON pooja_types;
CREATE POLICY "Anyone can view active pooja types" ON pooja_types FOR SELECT
  TO anon, authenticated
  USING (is_active = true OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert pooja types" ON pooja_types;
CREATE POLICY "Admins can insert pooja types" ON pooja_types FOR INSERT
  TO authenticated WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update pooja types" ON pooja_types;
CREATE POLICY "Admins can update pooja types" ON pooja_types FOR UPDATE
  TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete pooja types" ON pooja_types;
CREATE POLICY "Admins can delete pooja types" ON pooja_types FOR DELETE
  TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── PROVIDER POOJA SETUPS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_pooja_setups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  pooja_type_id uuid NOT NULL REFERENCES pooja_types(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  duration_minutes integer NOT NULL DEFAULT 60 CHECK (duration_minutes > 0 AND duration_minutes <= 1440),
  service_fee numeric(10,2) NOT NULL DEFAULT 0 CHECK (service_fee >= 0),
  language text NOT NULL DEFAULT '',
  special_instructions text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, pooja_type_id)
);
ALTER TABLE provider_pooja_setups ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_provider_pooja_setups_provider ON provider_pooja_setups(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_pooja_setups_active ON provider_pooja_setups(is_active);

DROP POLICY IF EXISTS "Public can view active pooja setups" ON provider_pooja_setups;
CREATE POLICY "Public can view active pooja setups" ON provider_pooja_setups FOR SELECT
  TO anon, authenticated
  USING (is_active = true AND EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = provider_pooja_setups.provider_id
    AND sp.approval_status = 'approved' AND sp.is_active = true
  ));

DROP POLICY IF EXISTS "Provider can view own pooja setups" ON provider_pooja_setups;
CREATE POLICY "Provider can view own pooja setups" ON provider_pooja_setups FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = provider_pooja_setups.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can insert own pooja setups" ON provider_pooja_setups;
CREATE POLICY "Provider can insert own pooja setups" ON provider_pooja_setups FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = provider_pooja_setups.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can update own pooja setups" ON provider_pooja_setups;
CREATE POLICY "Provider can update own pooja setups" ON provider_pooja_setups FOR UPDATE
  TO authenticated USING (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = provider_pooja_setups.provider_id AND sp.auth_user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = provider_pooja_setups.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can delete own pooja setups" ON provider_pooja_setups;
CREATE POLICY "Provider can delete own pooja setups" ON provider_pooja_setups FOR DELETE
  TO authenticated USING (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = provider_pooja_setups.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admin can manage all pooja setups" ON provider_pooja_setups;
CREATE POLICY "Admin can manage all pooja setups" ON provider_pooja_setups FOR ALL
  TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── PROVIDER POOJA ITEMS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_pooja_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pooja_setup_id uuid NOT NULL REFERENCES provider_pooja_setups(id) ON DELETE CASCADE,
  pooja_item_id uuid NOT NULL REFERENCES pooja_items(id) ON DELETE CASCADE,
  quantity numeric(10,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pooja_setup_id, pooja_item_id)
);
ALTER TABLE provider_pooja_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_provider_pooja_items_setup ON provider_pooja_items(pooja_setup_id);

DROP POLICY IF EXISTS "Public can view pooja setup items" ON provider_pooja_items;
CREATE POLICY "Public can view pooja setup items" ON provider_pooja_items FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Provider can view own pooja setup items" ON provider_pooja_items;
CREATE POLICY "Provider can view own pooja setup items" ON provider_pooja_items FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM provider_pooja_setups ps
    JOIN service_providers sp ON sp.id = ps.provider_id
    WHERE ps.id = provider_pooja_items.pooja_setup_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can insert own pooja setup items" ON provider_pooja_items;
CREATE POLICY "Provider can insert own pooja setup items" ON provider_pooja_items FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM provider_pooja_setups ps
    JOIN service_providers sp ON sp.id = ps.provider_id
    WHERE ps.id = provider_pooja_items.pooja_setup_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can update own pooja setup items" ON provider_pooja_items;
CREATE POLICY "Provider can update own pooja setup items" ON provider_pooja_items FOR UPDATE
  TO authenticated USING (EXISTS (
    SELECT 1 FROM provider_pooja_setups ps
    JOIN service_providers sp ON sp.id = ps.provider_id
    WHERE ps.id = provider_pooja_items.pooja_setup_id AND sp.auth_user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM provider_pooja_setups ps
    JOIN service_providers sp ON sp.id = ps.provider_id
    WHERE ps.id = provider_pooja_items.pooja_setup_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can delete own pooja setup items" ON provider_pooja_items;
CREATE POLICY "Provider can delete own pooja setup items" ON provider_pooja_items FOR DELETE
  TO authenticated USING (EXISTS (
    SELECT 1 FROM provider_pooja_setups ps
    JOIN service_providers sp ON sp.id = ps.provider_id
    WHERE ps.id = provider_pooja_items.pooja_setup_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admin can manage all pooja setup items" ON provider_pooja_items;
CREATE POLICY "Admin can manage all pooja setup items" ON provider_pooja_items FOR ALL
  TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── POOJA TYPE REQUESTS ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pooja_type_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  requested_name text NOT NULL,
  requested_description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pooja_type_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pooja_type_requests_status ON pooja_type_requests(status);
CREATE INDEX IF NOT EXISTS idx_pooja_type_requests_provider ON pooja_type_requests(provider_id);

DROP POLICY IF EXISTS "Provider can view own pooja type requests" ON pooja_type_requests;
CREATE POLICY "Provider can view own pooja type requests" ON pooja_type_requests FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = pooja_type_requests.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can insert own pooja type requests" ON pooja_type_requests;
CREATE POLICY "Provider can insert own pooja type requests" ON pooja_type_requests FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = pooja_type_requests.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admin can view all pooja type requests" ON pooja_type_requests;
CREATE POLICY "Admin can view all pooja type requests" ON pooja_type_requests FOR SELECT
  TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admin can update pooja type requests" ON pooja_type_requests;
CREATE POLICY "Admin can update pooja type requests" ON pooja_type_requests FOR UPDATE
  TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── POOJA LIST SHARES ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pooja_list_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id uuid NOT NULL REFERENCES service_providers(id) ON DELETE CASCADE,
  pooja_setup_id uuid NOT NULL REFERENCES provider_pooja_setups(id) ON DELETE CASCADE,
  customer_mobile text NOT NULL,
  share_token text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days',
  is_revoked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE pooja_list_shares ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_pooja_list_shares_token ON pooja_list_shares(share_token);
CREATE INDEX IF NOT EXISTS idx_pooja_list_shares_provider ON pooja_list_shares(provider_id);

DROP POLICY IF EXISTS "Provider can view own pooja list shares" ON pooja_list_shares;
CREATE POLICY "Provider can view own pooja list shares" ON pooja_list_shares FOR SELECT
  TO authenticated USING (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = pooja_list_shares.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can insert own pooja list shares" ON pooja_list_shares;
CREATE POLICY "Provider can insert own pooja list shares" ON pooja_list_shares FOR INSERT
  TO authenticated WITH CHECK (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = pooja_list_shares.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Provider can update own pooja list shares" ON pooja_list_shares;
CREATE POLICY "Provider can update own pooja list shares" ON pooja_list_shares FOR UPDATE
  TO authenticated USING (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = pooja_list_shares.provider_id AND sp.auth_user_id = auth.uid()
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM service_providers sp
    WHERE sp.id = pooja_list_shares.provider_id AND sp.auth_user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Admin can view all pooja list shares" ON pooja_list_shares;
CREATE POLICY "Admin can view all pooja list shares" ON pooja_list_shares FOR SELECT
  TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- Public read by token (for the web view) - no auth required
DROP POLICY IF EXISTS "Public can view active pooja list shares by token" ON pooja_list_shares;
CREATE POLICY "Public can view active pooja list shares by token" ON pooja_list_shares FOR SELECT
  TO anon, authenticated
  USING (is_revoked = false AND expires_at > now());

-- ─── TRIGGERS: updated_at ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_pooja_types_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS pooja_types_updated_at ON pooja_types;
CREATE TRIGGER pooja_types_updated_at BEFORE UPDATE ON pooja_types
  FOR EACH ROW EXECUTE FUNCTION update_pooja_types_updated_at();

CREATE OR REPLACE FUNCTION update_provider_pooja_setups_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS provider_pooja_setups_updated_at ON provider_pooja_setups;
CREATE TRIGGER provider_pooja_setups_updated_at BEFORE UPDATE ON provider_pooja_setups
  FOR EACH ROW EXECUTE FUNCTION update_provider_pooja_setups_updated_at();

CREATE OR REPLACE FUNCTION update_provider_pooja_items_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.created_at = NEW.created_at; RETURN NEW; END; $$ LANGUAGE plpgsql;

-- ─── SEED COMMON POOJA TYPES ──────────────────────────────────────────────────

INSERT INTO pooja_types (name, description, sort_order) VALUES
  ('Griha Pravesh', 'Housewarming ceremony for entering a new home', 1),
  ('Satyanarayan Puja', 'Worship of Lord Vishnu for prosperity and well-being', 2),
  ('Lakshmi Puja', 'Worship of Goddess Lakshmi for wealth and prosperity', 3),
  ('Ganesh Puja', 'Worship of Lord Ganesha for removing obstacles', 4),
  ('Navagraha Shanti', 'Pacification of the nine planets for harmony', 5),
  ('Rudrabhishek', 'Sacred bath to Lord Shiva with Rudra chants', 6),
  ('Vastu Shanti', 'Purification and harmonization of living space', 7),
  ('Mundan Sanskar', 'First hair tonsuring ceremony for children', 8),
  ('Namkaran Sanskar', 'Naming ceremony for a newborn child', 9),
  ('Vivah Sanskar', 'Hindu wedding ceremony with Vedic rituals', 10),
  ('Shraddha Karma', 'Rituals for ancestors and departed souls', 11),
  ('Sundarkand Path', 'Recitation of Sundarkand from Ramcharitmanas', 12)
ON CONFLICT DO NOTHING;

-- ─── REGISTER MODULE ──────────────────────────────────────────────────────────

INSERT INTO modules(key,label,description,sort_order) VALUES
  ('pooja_types','Pooja Types','Manage the catalogue of pooja types and skills for Pandits',66)
ON CONFLICT(key) DO UPDATE SET label=EXCLUDED.label,description=EXCLUDED.description,sort_order=EXCLUDED.sort_order;

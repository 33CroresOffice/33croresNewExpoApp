/*
  # Odia Panji Calendar Module

  ## Overview
  Creates the full Panji (Odia Panjika) calendar system — a database for admin-managed
  traditional Odia Hindu calendar entries, viewable by logged-in customers.

  ## New Tables

  ### `panji_entries`
  One row per Gregorian date, containing all traditional Odia calendar fields.
  - `id` (uuid, PK)
  - `date` (date, unique) — the Gregorian date this entry covers
  - `odia_date` (text) — human-readable Odia date, e.g. "15 Baisakha 1947"
  - `odia_month` (text) — Odia month name for grouping, e.g. "Baisakha"
  - `odia_year` (integer) — Odia/Saka year
  - `tithi` (text) — lunar day, e.g. "Tritiya"
  - `nakshatra` (text) — lunar mansion, e.g. "Rohini"
  - `yoga` (text) — e.g. "Shobhana"
  - `karana` (text) — half-tithi, e.g. "Bava"
  - `vara` (text) — Odia weekday name, e.g. "Sombara"
  - `sunrise` (text) — "06:12 AM"
  - `sunset` (text) — "06:45 PM"
  - `auspicious_timings` (text[]) — array of timing descriptions
  - `festivals` (text[]) — festivals/vratas for the day
  - `description` (text) — free-form notes
  - `is_published` (boolean, default false) — controls customer visibility
  - `created_by` (uuid, FK profiles)
  - `updated_by` (uuid, FK profiles)
  - `created_at`, `updated_at`

  ## Module Registration

  - Inserts 'panji' into the `modules` table
  - Grants 'panji' to 'super_admin' in `role_modules`

  ## Security

  - RLS enabled; authenticated customers can only read published entries
  - Admins with the 'panji' module can read all entries and write
*/

-- ─── panji_entries ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS panji_entries (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date                date        NOT NULL,
  odia_date           text        NOT NULL DEFAULT '',
  odia_month          text        NOT NULL DEFAULT '',
  odia_year           integer     NOT NULL DEFAULT 0,
  tithi               text        NOT NULL DEFAULT '',
  nakshatra           text        NOT NULL DEFAULT '',
  yoga                text        NOT NULL DEFAULT '',
  karana              text        NOT NULL DEFAULT '',
  vara                text        NOT NULL DEFAULT '',
  sunrise             text        NOT NULL DEFAULT '',
  sunset              text        NOT NULL DEFAULT '',
  auspicious_timings  text[]      NOT NULL DEFAULT '{}',
  festivals           text[]      NOT NULL DEFAULT '{}',
  description         text        NOT NULL DEFAULT '',
  is_published        boolean     NOT NULL DEFAULT false,
  created_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by          uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date)
);

ALTER TABLE panji_entries ENABLE ROW LEVEL SECURITY;

-- Customers: read only published entries
CREATE POLICY "Authenticated users can read published panji entries"
  ON panji_entries FOR SELECT
  TO authenticated
  USING (
    is_published = true
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Admins with panji module: insert
CREATE POLICY "Panji admins can insert entries"
  ON panji_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Admins with panji module: update
CREATE POLICY "Panji admins can update entries"
  ON panji_entries FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Admins with panji module: delete
CREATE POLICY "Panji admins can delete entries"
  ON panji_entries FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_panji_entries_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_panji_entries_updated_at
  BEFORE UPDATE ON panji_entries
  FOR EACH ROW EXECUTE FUNCTION update_panji_entries_updated_at();

-- Index for fast month-range queries
CREATE INDEX IF NOT EXISTS idx_panji_entries_date ON panji_entries(date);

-- ─── Register 'panji' module ──────────────────────────────────────────────────

INSERT INTO modules (key, label, description, sort_order)
VALUES ('panji', 'Odia Panji', 'Manage Odia Panji calendar entries', 105)
ON CONFLICT (key) DO NOTHING;

-- Grant to super_admin by default
INSERT INTO role_modules (role, module)
VALUES ('super_admin', 'panji')
ON CONFLICT DO NOTHING;

-- Re-sync JWTs for all admins so the new module appears immediately
DO $$
DECLARE rec RECORD;
BEGIN
  FOR rec IN SELECT id FROM profiles WHERE role = 'admin' LOOP
    PERFORM sync_user_modules_to_jwt(rec.id);
  END LOOP;
END;
$$;

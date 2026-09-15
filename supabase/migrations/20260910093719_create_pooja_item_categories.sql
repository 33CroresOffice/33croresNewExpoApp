/*
# Create Pooja Item Categories

## Summary
Adds a new `pooja_item_categories` table so admins can group pooja items into
categories (e.g. "Incense & Fragrance", "Flowers & Garlands", "Ritual Items").
Also adds an optional `category_id` foreign key on `pooja_items` so each item
can be assigned to a category.

## New Tables
1. `pooja_item_categories`
   - id (uuid, primary key)
   - name (text, not null, unique)
   - description (text, default '')
   - sort_order (integer, default 0)
   - is_active (boolean, default true)
   - created_at, updated_at (timestamps)

## Modified Tables
- `pooja_items`: adds nullable `category_id` column (FK → pooja_item_categories,
  ON DELETE SET NULL). Existing rows are unaffected (column is nullable).

## Security
- RLS enabled on `pooja_item_categories`.
- Public read for active categories (authenticated); admin full CRUD via JWT
  app_metadata role check — matching the pattern used on `pooja_items`.
- updated_at trigger added to keep the column in sync.
*/

-- ─── POOJA ITEM CATEGORIES TABLE ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pooja_item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pooja_item_categories ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_pooja_item_categories_active
  ON pooja_item_categories(is_active, sort_order);

-- Public can read active categories; admins can read all and manage everything
DROP POLICY IF EXISTS "Anyone can view active pooja item categories" ON pooja_item_categories;
CREATE POLICY "Anyone can view active pooja item categories"
  ON pooja_item_categories FOR SELECT
  TO authenticated
  USING (is_active = true OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert pooja item categories" ON pooja_item_categories;
CREATE POLICY "Admins can insert pooja item categories"
  ON pooja_item_categories FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update pooja item categories" ON pooja_item_categories;
CREATE POLICY "Admins can update pooja item categories"
  ON pooja_item_categories FOR UPDATE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete pooja item categories" ON pooja_item_categories;
CREATE POLICY "Admins can delete pooja item categories"
  ON pooja_item_categories FOR DELETE
  TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- ─── ADD category_id TO pooja_items ───────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pooja_items' AND column_name = 'category_id'
  ) THEN
    ALTER TABLE pooja_items
      ADD COLUMN category_id uuid REFERENCES pooja_item_categories(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ─── TRIGGER: updated_at on pooja_item_categories ──────────────────────────────

CREATE OR REPLACE FUNCTION update_pooja_item_categories_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pooja_item_categories_updated_at ON pooja_item_categories;
CREATE TRIGGER pooja_item_categories_updated_at
  BEFORE UPDATE ON pooja_item_categories
  FOR EACH ROW EXECUTE FUNCTION update_pooja_item_categories_updated_at();

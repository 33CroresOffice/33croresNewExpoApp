/*
# Create rider_pickup_prices table

1. Why

The Admin Panel's Rider Details → Pickup tab has a "Set Per Day Price" modal that
saves to `rider_pickup_prices`, and the Rider App's pickups screen reads the same
table — but the table was never created, so every save silently failed and the
monthly pickup salary stayed ₹0.

2. New Table: `rider_pickup_prices`

- `id` (uuid, primary key, default gen_random_uuid())
- `rider_id` (uuid, not null, references riders(id) on delete cascade) — the rider the price applies to
- `month` (text, not null) — month key in `YYYY-MM` format
- `per_day_price` (numeric, not null, default 0) — amount paid per fully completed pickup day
- `created_by` (uuid, nullable) — admin profile that set the price
- `created_at` / `updated_at` (timestamptz, defaults) — audit timestamps
- Unique constraint on (rider_id, month) so the admin upsert keyed on those columns works

3. Security

- RLS enabled.
- Admins (role in JWT app_metadata) can read and write rows.
- Riders can read only their own month prices (matched through riders.profile_id).
- Grants: SELECT/INSERT/UPDATE/DELETE to authenticated only.

4. Notes

- One price per rider per month; the admin screen computes monthly pickup salary
  as completed pickup dates × per_day_price.
*/

CREATE TABLE IF NOT EXISTS rider_pickup_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  month text NOT NULL,
  per_day_price numeric NOT NULL DEFAULT 0 CHECK (per_day_price >= 0),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rider_id, month)
);

ALTER TABLE rider_pickup_prices ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON rider_pickup_prices TO authenticated;

DROP POLICY IF EXISTS "Admins can view rider pickup prices" ON rider_pickup_prices;
CREATE POLICY "Admins can view rider pickup prices"
ON rider_pickup_prices FOR SELECT
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can insert rider pickup prices" ON rider_pickup_prices;
CREATE POLICY "Admins can insert rider pickup prices"
ON rider_pickup_prices FOR INSERT
TO authenticated
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can update rider pickup prices" ON rider_pickup_prices;
CREATE POLICY "Admins can update rider pickup prices"
ON rider_pickup_prices FOR UPDATE
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Admins can delete rider pickup prices" ON rider_pickup_prices;
CREATE POLICY "Admins can delete rider pickup prices"
ON rider_pickup_prices FOR DELETE
TO authenticated
USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

DROP POLICY IF EXISTS "Riders can view own pickup prices" ON rider_pickup_prices;
CREATE POLICY "Riders can view own pickup prices"
ON rider_pickup_prices FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM riders r
    WHERE r.id = rider_pickup_prices.rider_id
      AND r.profile_id = auth.uid()
  )
);

/*
# Rider App Open Log

## Purpose
Creates a new table `rider_app_opens` that records every time a rider opens
the rider app, with the date/time and GPS location of the open. This gives
admins a complete activity trail alongside the existing Present (attendance)
and Delivery logs.

## New Tables
- `rider_app_opens`
  - `id` (uuid, primary key)
  - `rider_id` (uuid, FK to riders.id, on delete cascade) - which rider opened the app
  - `latitude` / `longitude` (numeric, nullable) - GPS location at the time of open
  - `location_source` (text) - how the location was obtained: 'gps' or 'ip' or 'unavailable'
  - `opened_at` (timestamptz, default now()) - when the app was opened

## Security (RLS)
- Enable RLS on `rider_app_opens`.
- SELECT: admins (via is_admin()) can view all rows.
- INSERT: riders can insert rows for themselves only (rider matched by
  profile_id = auth.uid()), matching the pattern of the existing rider
  self-service attendance policies.
- No UPDATE or DELETE policies: app open records are an append-only audit
  trail; riders and admins modify them through admin tooling only.

## Indexes
- Index on rider_id for per-rider queries.
- Index on opened_at descending for date-range listing.
- Composite index on (rider_id, opened_at) for per-rider history queries.

## Notes
1. Location is best-effort: if GPS permission is unavailable the row is still
   recorded with null coordinates, so the open event is never lost.
2. Existing attendance and delivery tables already store location data, so
   no changes are needed there.
*/

CREATE TABLE IF NOT EXISTS rider_app_opens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  latitude numeric(10, 7),
  longitude numeric(10, 7),
  location_source text NOT NULL DEFAULT 'unavailable',
  opened_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE rider_app_opens ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_rao_rider_id ON rider_app_opens(rider_id);
CREATE INDEX IF NOT EXISTS idx_rao_opened_at ON rider_app_opens(opened_at DESC);
CREATE INDEX IF NOT EXISTS idx_rao_rider_opened ON rider_app_opens(rider_id, opened_at DESC);

DROP POLICY IF EXISTS "Admins can select rider_app_opens" ON rider_app_opens;
CREATE POLICY "Admins can select rider_app_opens"
  ON rider_app_opens FOR SELECT
  TO authenticated
  USING (is_admin());

DROP POLICY IF EXISTS "Riders can insert own app opens" ON rider_app_opens;
CREATE POLICY "Riders can insert own app opens"
  ON rider_app_opens FOR INSERT
  TO authenticated
  WITH CHECK (
    rider_id IN (
      SELECT id FROM riders WHERE profile_id = auth.uid()
    )
  );
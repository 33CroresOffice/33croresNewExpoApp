/*
# Add latitude / longitude to addresses

1. Purpose
   - Allow customers to pick a precise delivery location on a map.
   - Store the selected coordinates alongside the existing address fields.
2. Schema changes
   - `addresses.latitude`  double precision, nullable (existing rows unaffected).
   - `addresses.longitude` double precision, nullable (existing rows unaffected).
3. Security
   - No policy changes. Existing ownership RLS already governs these columns.
4. Notes
   - Columns are nullable so current addresses keep working without coordinates.
   - No indexes added; coordinates are written/read with the address row, not queried independently.
*/

ALTER TABLE addresses
  ADD COLUMN IF NOT EXISTS latitude  double precision,
  ADD COLUMN IF NOT EXISTS longitude double precision;
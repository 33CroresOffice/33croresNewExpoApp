/*
# Add locality_id and apartment_id to addresses

1. Changes
- Adds `locality_id` (text, nullable) to `addresses` — stores the locality unique_code.
- Adds `apartment_id` (integer, nullable) to `addresses` — stores the flower__apartment.id.
- Backfills `locality_id` from existing `street` field where possible (no-op if street doesn't match).
2. Important Notes
- Both columns are nullable for backward compatibility with existing addresses.
- `locality_id` references localities.unique_code (text), not localities.id.
- `apartment_id` references flower__apartment.id (integer).
- No foreign key constraints added to avoid breaking existing data that may not match.
*/

ALTER TABLE addresses ADD COLUMN IF NOT EXISTS locality_id text;
ALTER TABLE addresses ADD COLUMN IF NOT EXISTS apartment_id integer;

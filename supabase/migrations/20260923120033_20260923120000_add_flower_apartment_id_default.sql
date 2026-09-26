/*
# Add automatic IDs for flower apartments

1. Purpose
- Fixes apartment creation from the admin panel when the insert omits `id`.
- New apartment rows will receive the next available integer ID automatically.

2. Modified Tables
- `flower__apartment`
- Adds a sequence-backed default to the existing `id` column.
- Existing apartment IDs and all other apartment data remain unchanged.

3. Data Safety
- Creates the sequence only if it does not already exist.
- Initializes the sequence after the current highest apartment ID.
- Does not delete, rename, or change any existing column values.

4. Security
- No RLS policies or access permissions are changed.
*/

CREATE SEQUENCE IF NOT EXISTS flower_apartment_id_seq;

SELECT setval(
  'flower_apartment_id_seq',
  COALESCE((SELECT MAX(id) FROM flower__apartment), 0) + 1,
  false
);

ALTER SEQUENCE flower_apartment_id_seq
  OWNED BY flower__apartment.id;

ALTER TABLE flower__apartment
  ALTER COLUMN id SET DEFAULT nextval('flower_apartment_id_seq');
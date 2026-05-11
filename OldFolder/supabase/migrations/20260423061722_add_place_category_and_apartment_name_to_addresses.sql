/*
  # Add place_category and apartment_name to addresses

  New fields to support richer address capture:
  - place_category: type of place (individual, apartment, business, temple)
  - apartment_name: name of the apartment/building/complex
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'addresses' AND column_name = 'place_category'
  ) THEN
    ALTER TABLE addresses ADD COLUMN place_category text DEFAULT 'individual';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'addresses' AND column_name = 'apartment_name'
  ) THEN
    ALTER TABLE addresses ADD COLUMN apartment_name text;
  END IF;
END $$;

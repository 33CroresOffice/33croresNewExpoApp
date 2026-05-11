/*
  # Extend flower_types table

  ## Summary
  Adds availability seasonality and expands unit type options for flower types.

  ## Changes

  ### Modified Tables
  - `flower_types`
    - `available_months` (integer[], nullable): Array of month numbers (1-12) indicating
       which months this flower is available. NULL means available year-round.
    - `unit_type` constraint relaxed: new allowed values added — 'stems', 'grams', 'dozen'
       in addition to existing 'kg', 'pieces', 'bunch'.

  ## Notes
  - Existing rows are unaffected; available_months defaults to NULL (year-round).
  - unit_type is stored as free text; no enum enforced at DB level, validation is in app.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'flower_types' AND column_name = 'available_months'
  ) THEN
    ALTER TABLE flower_types ADD COLUMN available_months integer[];
  END IF;
END $$;

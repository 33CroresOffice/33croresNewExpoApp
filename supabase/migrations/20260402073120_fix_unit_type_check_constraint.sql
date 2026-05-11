/*
  # Fix unit_type check constraint on flower_types

  ## Summary
  The existing check constraint only allowed 'kg', 'pieces', 'bunch'.
  This migration drops the old constraint and adds a new one that includes
  all supported unit types: bunch, stems, pieces, dozen, kg, grams.
*/

ALTER TABLE flower_types DROP CONSTRAINT IF EXISTS flower_types_unit_type_check;

ALTER TABLE flower_types ADD CONSTRAINT flower_types_unit_type_check
  CHECK (unit_type IN ('kg', 'pieces', 'bunch', 'stems', 'grams', 'dozen'));

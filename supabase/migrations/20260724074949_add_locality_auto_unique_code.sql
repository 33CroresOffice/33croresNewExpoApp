/*
# Auto-generate unique_code for localities

1. Changes
- Adds a BEFORE INSERT trigger function `set_locality_unique_code()` that computes
  the next zero-padded sequential code (e.g. 163, 164...) based on the max existing
  numeric unique_code, and assigns it to NEW.unique_code.
- Adds a BEFORE INSERT trigger `set_locality_unique_code` on the localities table.
2. Important Notes
- Existing rows are untouched.
- If a future insert explicitly provides a unique_code, the trigger leaves it alone
  (the WHEN clause restricts to null/empty).
*/

CREATE OR REPLACE FUNCTION set_locality_unique_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  max_code int;
  next_code int;
BEGIN
  SELECT COALESCE(MAX(CAST(unique_code AS int)), 0)
  INTO max_code
  FROM localities
  WHERE unique_code ~ '^[0-9]+$';

  next_code := max_code + 1;
  NEW.unique_code := lpad(next_code::text, 3, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_locality_unique_code ON localities;

CREATE TRIGGER set_locality_unique_code
  BEFORE INSERT ON localities
  FOR EACH ROW
  WHEN (NEW.unique_code IS NULL OR NEW.unique_code = '')
  EXECUTE FUNCTION set_locality_unique_code();

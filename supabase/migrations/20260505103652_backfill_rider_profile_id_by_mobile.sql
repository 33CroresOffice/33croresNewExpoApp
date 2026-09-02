/*
  # Backfill rider profile_id by mobile match

  ## Summary
  Riders are linked to auth/profile users via the `profile_id` column, but existing
  rider records have `profile_id = NULL` because the admin create form never set it.

  This migration:
  1. Backfills `profile_id` for all riders where mobile matches a profile with role='rider'
  2. Adds a DB trigger so future rider inserts/updates auto-link profile_id when mobile matches

  ## Tables Modified
  - `riders`: backfill profile_id where it is null and mobile matches profiles.mobile
*/

-- 1. Backfill existing riders
UPDATE riders r
SET profile_id = p.id
FROM profiles p
WHERE p.mobile = r.mobile
  AND p.role = 'rider'
  AND r.profile_id IS NULL;

-- 2. Trigger function: auto-link profile_id on insert/update if mobile matches a rider-role profile
CREATE OR REPLACE FUNCTION auto_link_rider_profile()
RETURNS TRIGGER AS $$
DECLARE
  matched_profile_id uuid;
BEGIN
  IF NEW.profile_id IS NULL AND NEW.mobile IS NOT NULL THEN
    SELECT id INTO matched_profile_id
    FROM profiles
    WHERE mobile = NEW.mobile AND role = 'rider'
    LIMIT 1;

    IF matched_profile_id IS NOT NULL THEN
      NEW.profile_id := matched_profile_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_link_rider_profile ON riders;
CREATE TRIGGER trg_auto_link_rider_profile
  BEFORE INSERT OR UPDATE ON riders
  FOR EACH ROW
  EXECUTE FUNCTION auto_link_rider_profile();

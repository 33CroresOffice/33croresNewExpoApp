/*
  # Add extended profile fields

  ## Summary
  Adds optional profile fields to support the Edit Profile screen:

  ## New Columns on `profiles`
  - `email` (text, nullable) — user's email address
  - `date_of_birth` (date, nullable) — user's date of birth
  - `gender` (text, nullable) — user's gender (male/female/other/prefer_not_to_say)
  - `about` (text, nullable) — short bio / about yourself text

  ## Security
  - No new RLS policies needed; existing profiles policies cover these columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'email'
  ) THEN
    ALTER TABLE profiles ADD COLUMN email text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'date_of_birth'
  ) THEN
    ALTER TABLE profiles ADD COLUMN date_of_birth date;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'gender'
  ) THEN
    ALTER TABLE profiles ADD COLUMN gender text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'about'
  ) THEN
    ALTER TABLE profiles ADD COLUMN about text;
  END IF;
END $$;

/*
  # Add photo and ID document fields to riders table

  ## Changes
  - Adds `id_card_type` (text, nullable) - type of ID document: 'aadhaar', 'pan', 'dl', 'voter', 'passport', 'other'
  - Adds `id_card_number` (text, nullable) - the document number
  - Adds `id_card_photo_url` (text, nullable) - URL of uploaded ID card photo
  - Adds `license_photo_url` (text, nullable) - URL of uploaded driving license photo

  Note: `profile_photo_url` column already exists on the riders table.

  ## Security
  - No RLS changes needed; existing rider policies cover these columns
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'id_card_type'
  ) THEN
    ALTER TABLE riders ADD COLUMN id_card_type text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'id_card_number'
  ) THEN
    ALTER TABLE riders ADD COLUMN id_card_number text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'id_card_photo_url'
  ) THEN
    ALTER TABLE riders ADD COLUMN id_card_photo_url text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'license_photo_url'
  ) THEN
    ALTER TABLE riders ADD COLUMN license_photo_url text;
  END IF;
END $$;

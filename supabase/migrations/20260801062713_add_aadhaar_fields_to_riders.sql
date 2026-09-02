ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS aadhaar_number text,
  ADD COLUMN IF NOT EXISTS aadhaar_photo_url text;

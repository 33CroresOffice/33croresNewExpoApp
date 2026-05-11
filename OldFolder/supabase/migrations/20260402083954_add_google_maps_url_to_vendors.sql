/*
  # Add Google Maps URL to vendors

  ## Changes
  - Adds `google_maps_url` (text, nullable) column to the `vendors` table
    - Stores a Google Maps link to the vendor's physical location

  ## Notes
  - Non-destructive: column is optional (nullable)
  - No RLS changes required
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'vendors' AND column_name = 'google_maps_url'
  ) THEN
    ALTER TABLE vendors ADD COLUMN google_maps_url text;
  END IF;
END $$;

/*
  # Add landmark column to addresses

  1. Changes
    - `addresses` table: add nullable `landmark` text column for nearby landmark reference
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'addresses' AND column_name = 'landmark' AND table_schema = 'public'
  ) THEN
    ALTER TABLE public.addresses ADD COLUMN landmark text;
  END IF;
END $$;

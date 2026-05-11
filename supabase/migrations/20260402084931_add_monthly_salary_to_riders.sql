/*
  # Add monthly_salary to riders table

  ## Changes
  - Adds `monthly_salary` (integer, nullable, default 0) column to the `riders` table
    - Stores the rider's fixed monthly salary in INR

  ## Notes
  - Non-destructive: existing daily_rate and per_delivery_rate columns are preserved
  - No RLS changes required
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'riders' AND column_name = 'monthly_salary'
  ) THEN
    ALTER TABLE riders ADD COLUMN monthly_salary integer DEFAULT 0;
  END IF;
END $$;

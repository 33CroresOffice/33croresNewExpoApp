/*
  # Add pause_start_date to subscriptions

  ## Changes
  - `subscriptions` table
    - Added `pause_start_date` (date, nullable): The date the pause begins. 
      Previously only `pause_until` (end date) was stored; now customers can 
      specify a custom start date so pauses can be scheduled in the future.

  ## Notes
  - Existing rows default to NULL (no start date set = immediately paused)
  - No data is lost; existing pause_until values remain intact
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'pause_start_date'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN pause_start_date date DEFAULT NULL;
  END IF;
END $$;

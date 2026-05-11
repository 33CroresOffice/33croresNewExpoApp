/*
  # Add end_date to subscriptions

  ## Summary
  Adds an `end_date` column to the `subscriptions` table to explicitly store when
  a subscription expires. This is set at creation time as start_date + 1 month,
  and is extended whenever a subscription is paused (pause duration is added to end_date).

  ## Changes
  - `subscriptions` table: new column `end_date` (date, nullable for existing rows)

  ## Notes
  - Existing rows will have end_date = NULL (computed on-the-fly in app logic)
  - New subscriptions will always have end_date populated by the edge function
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'end_date'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN end_date date;
  END IF;
END $$;

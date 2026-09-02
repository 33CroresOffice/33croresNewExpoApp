/*
# Add new_end_date column to subscriptions

## Summary
The `subscriptions` table is missing the `new_end_date` column that the app
and several edge functions already reference. Without it, any query that
selects `new_end_date` (e.g. the admin Orders page) fails with
`column subscriptions.new_end_date does not exist`, which makes the entire
Subscription Orders list appear empty.

## Changes
- `subscriptions` table: new nullable `new_end_date` column (date).
  It stores the updated end date after a renewal, separate from the
  original `end_date`. Existing rows get NULL, which the app already
  treats as "fall back to end_date".

## Security
- No RLS policy changes. No new tables.

## Notes
- Idempotent: uses an information_schema guard so re-running is safe.
- The column is nullable so existing data is unaffected.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscriptions' AND column_name = 'new_end_date'
  ) THEN
    ALTER TABLE subscriptions ADD COLUMN new_end_date date;
  END IF;
END $$;

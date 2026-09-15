/*
# Restore Incorrectly Expired Subscriptions

## Summary
The daily renewal cron job was using the original `end_date` instead of the
effective end date (`COALESCE(new_end_date, end_date)`) when deciding which
subscriptions to expire. This caused subscriptions that had been paused
(and thus had their end date extended via `new_end_date`) to be incorrectly
marked as expired even though their extended end date was still in the future.

This migration restores those incorrectly expired subscriptions back to
active status and logs the restoration in the customer activity log.

## Details
1. Finds all subscriptions where:
   - status = 'expired'
   - new_end_date is not null and is in the future
   - original end_date is in the past (the trigger for incorrect expiration)
2. Sets those subscriptions back to status = 'active' and renewal_status = 'none'
3. Inserts a customer_activity_log entry for each restoration

## Affected Subscriptions
- Sukanya Sharma (end_date: 2026-09-05, new_end_date: 2026-09-11)
- arpita (end_date: 2026-09-03, new_end_date: 2026-09-11)
- Amrit (end_date: 2026-09-01, new_end_date: 2026-09-11)
- Gayatri Brahma (end_date: 2026-06-18, new_end_date: 2026-10-01)

## Security
No RLS or policy changes — this is a data correction only.
*/

WITH restored AS (
  UPDATE public.subscriptions
  SET status = 'active',
      renewal_status = 'none'
  WHERE status = 'expired'
    AND new_end_date IS NOT NULL
    AND new_end_date > CURRENT_DATE
    AND end_date < CURRENT_DATE
  RETURNING id, user_id, end_date, new_end_date
)
INSERT INTO public.customer_activity_log (customer_id, activity_type, description, metadata)
SELECT
  r.user_id,
  'note_added',
  'Subscription restored to active — was incorrectly expired by cron job using original end_date instead of extended new_end_date',
  jsonb_build_object(
    'subscription_id', r.id,
    'trigger', 'manual_restoration',
    'original_end_date', r.end_date,
    'extended_end_date', r.new_end_date,
    'reason', 'cron_job_used_wrong_date_column'
  )
FROM restored r;
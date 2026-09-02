/*
# Add hourly cron job for pending-subscriber WhatsApp reminders

1. Changes
- Creates a pg_cron job `check-pending-subscribers` that fires every hour.
- The job calls the `check-pending-subscribers` edge function via pg net.
- This sends the approved MSG91 WhatsApp "subscription_pending" template to customers 24 hours after their first login if they still have no active subscription.
2. Security
- No RLS or policy changes — only a cron job registration.
3. Notes
- Idempotent: uses a DO block to unschedule if the job exists, then schedules fresh.
*/

DO $$
BEGIN
  PERFORM cron.unschedule(jobname) FROM cron.job WHERE jobname = 'check-pending-subscribers';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'check-pending-subscribers',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/check-pending-subscribers',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

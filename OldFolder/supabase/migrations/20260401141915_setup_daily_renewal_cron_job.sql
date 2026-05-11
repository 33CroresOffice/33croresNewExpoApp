/*
  # Schedule Daily Renewal Check Cron Job

  ## Summary
  Creates a pg_cron job that calls the check-subscription-renewals edge function
  every day at 02:30 UTC (= 8:00 AM IST).

  ## Details
  - Schedule: `30 2 * * *` — runs at 02:30 UTC every day
  - Uses pg_net to make an HTTP POST to the edge function
  - Job is idempotent: existing job is removed before re-creating

  ## Notes
  1. The Supabase project URL is hard-coded here (matches the project URL)
  2. verify_jwt is false on the function so no bearer token is required
*/

SELECT cron.unschedule('daily-renewal-check')
FROM cron.job
WHERE jobname = 'daily-renewal-check';

SELECT cron.schedule(
  'daily-renewal-check',
  '30 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/check-subscription-renewals',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

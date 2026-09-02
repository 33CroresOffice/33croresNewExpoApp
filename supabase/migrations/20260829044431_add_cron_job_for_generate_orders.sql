/*
# Add daily cron job to generate orders

1. Purpose
- Run the generate-orders edge function every day at 5:30 AM IST (00:00 UTC) so that
  daily subscriptions get their order rows created one day in advance.
2. Changes
- Create a pg_cron job named 'generate-daily-orders' that POSTs to the generate-orders
  edge function endpoint.
3. Security
- No RLS or policy changes.
*/

SELECT cron.schedule(
  'generate-daily-orders',
  '0 0 * * *',
  $$
    SELECT net.http_post(
      url := 'https://owqkiszgtzwwjfvgymau.supabase.co/functions/v1/generate-orders',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  $$
);

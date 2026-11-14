/*
# Add get_scheduler_timezone RPC for Cron Management display

1. New Function
- `get_scheduler_timezone()` returns `text`: the database timezone that the
  cron scheduler uses to interpret stored schedules (via `current_setting('TimeZone')`).
  The Cron Management screen calls this at runtime so schedule/next-run/last-run
  times are converted to IST using the scheduler's actual timezone instead of
  assuming UTC.
- Read-only, no side effects, not SECURITY DEFINER.

2. Security
- No new tables or RLS changes.
- EXECUTE granted to `authenticated` only (the Cron Management screen is an
  admin page); revoked from `PUBLIC` and `anon`.
*/

CREATE OR REPLACE FUNCTION get_scheduler_timezone()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT current_setting('TimeZone');
$$;

REVOKE EXECUTE ON FUNCTION get_scheduler_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_scheduler_timezone() TO authenticated;

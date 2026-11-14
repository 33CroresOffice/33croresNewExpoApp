/*
# Fix get_scheduler_timezone to read pg_cron's own timezone setting (v2)

1. Background
- pg_cron interprets stored cron expressions using its own `cron.timezone`
  GUC, which is separate from the session/server `TimeZone` setting. In
  self-hosted deployments `TimeZone` may be UTC while `cron.timezone` is
  `Asia/Kolkata` (or vice versa).
- The original version of this function returned `current_setting('TimeZone')`,
  so the Cron Management screen mis-converted schedules by +5:30 whenever the
  two settings differed (e.g. "0 8 * * *" displayed as 1:30 PM IST instead of
  8:00 AM IST).

2. Changes
- `get_scheduler_timezone()` now returns `current_setting('cron.timezone')`
  when the pg_cron extension is loaded and the setting is non-empty, falling
  back to `current_setting('TimeZone')` otherwise. If pg_cron is not
  installed, `current_setting('cron.timezone', true)` returns NULL (no
  error) and the fallback applies, so this is safe on any PostgreSQL setup.
- Read-only, STABLE, not SECURITY DEFINER.
- No cron schedules, job activation states, or execution history are touched.

3. Security
- EXECUTE granted to `authenticated` only (the Cron Management screen is an
  admin page); revoked from `PUBLIC` and `anon`.
*/

CREATE OR REPLACE FUNCTION get_scheduler_timezone()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('cron.timezone', true), ''),
    current_setting('TimeZone')
  );
$$;

REVOKE EXECUTE ON FUNCTION get_scheduler_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_scheduler_timezone() TO authenticated;

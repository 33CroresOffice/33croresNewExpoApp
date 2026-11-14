/*
# Fix get_scheduler_timezone to read pg_cron's own timezone setting

1. Background
- pg_cron interprets stored cron expressions using its own `cron.timezone`
  setting (a separate GUC from the session/server `TimeZone`). On this
  database `cron.timezone` defaults to GMT while `TimeZone` is UTC, and in
  self-hosted deployments admins may set `cron.timezone = Asia/Kolkata`
  while the session timezone stays UTC.
- The previous version of this function returned `current_setting('TimeZone')`,
  so the Cron Management screen mis-converted schedules by +5:30 whenever
  `cron.timezone` differed from the session timezone (e.g. "0 8 * * *"
  displayed as 1:30 PM IST instead of 8:00 AM IST).

2. Changes
- `get_scheduler_timezone()` now returns `current_setting('cron.timezone')`
  when the pg_cron extension is installed and the setting is non-empty,
  falling back to `current_setting('TimeZone')` otherwise. This makes
  Schedule, Next Run, and Edit Time all derive from the same timezone the
  scheduler actually uses.
- Read-only, STABLE, not SECURITY DEFINER. No tables, columns, schedules,
  or job activation states are changed.

3. Security
- Unchanged: EXECUTE remains granted to `authenticated` only; revoked from
  `PUBLIC` and `anon`.
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

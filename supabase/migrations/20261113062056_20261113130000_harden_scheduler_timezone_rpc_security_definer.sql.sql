/*
# Preserve get_scheduler_timezone with SECURITY DEFINER and locked search_path

1. Purpose
- Re-asserts the corrected logic of `get_scheduler_timezone()`: pg_cron reads
  its own `cron.timezone` setting (separate from the session `TimeZone`), so
  the function must return `cron.timezone` when the pg_cron extension is
  loaded and the setting is non-empty, falling back to `TimeZone` otherwise.
  The Cron Management screen uses this value to convert stored schedules to
  IST correctly in both UTC-scheduler and Asia/Kolkata-scheduler setups.

2. Changes
- The function is now `SECURITY DEFINER` with a restricted search path
  (`SET search_path = pg_catalog`). `current_setting` resolves through
  pg_catalog only, so the function cannot be shadowed by a malicious object
  in another schema and runs with fixed privileges. It only reads settings
  and touches no tables, so definer rights carry no data access.
- Idempotent: `CREATE OR REPLACE FUNCTION` keeps the existing signature
  (text, no arguments); the GRANT/REVOKE pair is re-applied each run with no
  error if already present. Safe to re-run on any environment.
- No cron schedules, job activation states, or execution history
  (cron.job / cron.job_run_details) are read or modified.

3. Security
- EXECUTE remains granted to `authenticated` only; revoked from `PUBLIC` and
  `anon`. Callers cannot reach the function without an authenticated session.
*/

CREATE OR REPLACE FUNCTION get_scheduler_timezone()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('cron.timezone', true), ''),
    current_setting('TimeZone')
  );
$$;

REVOKE EXECUTE ON FUNCTION get_scheduler_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_scheduler_timezone() TO authenticated;

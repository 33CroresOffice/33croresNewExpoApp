/*
  # Enable pg_cron and pg_net Extensions

  ## Summary
  Enables the pg_cron and pg_net extensions required for scheduling and HTTP calls.

  ## Notes
  1. pg_cron: Allows scheduling PostgreSQL jobs (cron syntax)
  2. pg_net: Allows async HTTP calls from within PostgreSQL
*/

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

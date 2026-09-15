/*
  # Remove unsafe push cron credentials

  The previous push cron jobs used a placeholder bearer token. Remove those jobs and keep push delivery behind authenticated Edge Function access until a managed server secret is available.
*/

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('push-rider-checkin-reminder','push-admin-unassigned-alerts','push-vendor-procurement');

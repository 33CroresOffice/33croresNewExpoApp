/* Reschedule auto-assignment cron from 6:05 AM IST to midnight IST (18:30 UTC). */

SELECT cron.unschedule('auto-assign-riders-daily');
SELECT cron.schedule('auto-assign-riders-daily', '30 18 * * *', $$SELECT auto_assign_riders(CURRENT_DATE + 1)$$);

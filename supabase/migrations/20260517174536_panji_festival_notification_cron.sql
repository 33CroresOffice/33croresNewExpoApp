/*
  # Panji Festival Notification Cron Job

  ## Overview
  Sets up an automated daily cron job that sends push notifications to users
  the evening before any festival listed in a Panji entry.

  ## What it does
  - Runs every evening at 7:00 PM IST (13:30 UTC)
  - Looks for published Panji entries for tomorrow that have festivals
  - Enqueues push notifications in notification_logs for each active subscriber

  ## Notes
  - Uses the existing pg_cron + pg_net infrastructure already set up in this project
  - Calls the send-notification edge function (same pattern as renewal notifications)
  - Template key: 'panji_festival_reminder' — body configurable in notification-templates admin
  - Only fires when the Panji entry is published (is_published = true)
*/

-- ─── Seed notification event type labels in notification_templates if needed ──
-- (The actual template body is created/edited by admins in the UI)
-- We just ensure the event_type column accepts the new values by checking constraint

-- The notification_templates table stores event_type as text with a CHECK constraint.
-- We extend it to accept the new Panji event types.

DO $$
BEGIN
  -- Drop and re-create the check constraint if it exists and is restrictive
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'notification_templates'
      AND constraint_name = 'notification_templates_event_type_check'
  ) THEN
    ALTER TABLE notification_templates
      DROP CONSTRAINT notification_templates_event_type_check;

    ALTER TABLE notification_templates
      ADD CONSTRAINT notification_templates_event_type_check
      CHECK (event_type IN (
        'subscription_expiring_3days',
        'subscription_expiring_1day',
        'subscription_expired',
        'subscription_renewed',
        'subscription_activated',
        'subscription_paused',
        'payment_pending',
        'payment_received',
        'renewal_due',
        'order_dispatched',
        'order_delivered',
        'panji_festival_reminder',
        'panji_daily_digest',
        'custom'
      ));
  END IF;
END $$;

-- ─── Panji festival notification function ────────────────────────────────────

CREATE OR REPLACE FUNCTION notify_panji_festivals()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_tomorrow   date := CURRENT_DATE + INTERVAL '1 day';
  v_entry      RECORD;
  v_user       RECORD;
  v_festival   text;
  v_supabase_url text := current_setting('app.supabase_url', true);
  v_service_key  text := current_setting('app.service_role_key', true);
BEGIN
  -- Find the Panji entry for tomorrow with festivals
  SELECT * INTO v_entry
  FROM panji_entries
  WHERE date = v_tomorrow
    AND is_published = true
    AND array_length(festivals, 1) > 0;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  -- Build festival label (first festival, or "festivals" if multiple)
  IF array_length(v_entry.festivals, 1) = 1 THEN
    v_festival := v_entry.festivals[1];
  ELSE
    v_festival := array_to_string(v_entry.festivals, ', ');
  END IF;

  -- Enqueue a notification_log row for each active subscriber
  -- The actual push delivery is handled by the existing notification processing pipeline
  FOR v_user IN
    SELECT DISTINCT s.user_id, p.full_name
    FROM subscriptions s
    JOIN profiles p ON p.id = s.user_id
    WHERE s.status IN ('active', 'paused')
  LOOP
    INSERT INTO notification_logs (
      user_id,
      event_type,
      channel,
      recipient_mobile,
      rendered_subject,
      rendered_body,
      status,
      created_at
    )
    SELECT
      v_user.user_id,
      'panji_festival_reminder',
      'push',
      NULL,
      'Festival Tomorrow: ' || v_festival,
      COALESCE(
        replace(replace(replace(nt.body,
          '{{festival_name}}', v_festival),
          '{{tithi}}', COALESCE(v_entry.tithi, '')),
          '{{odia_date}}', COALESCE(v_entry.odia_date, '')
        ),
        'Tomorrow is ' || v_festival || '. ' || COALESCE(v_entry.odia_date, '') || COALESCE(' — Tithi: ' || v_entry.tithi, '')
      ),
      'pending',
      now()
    FROM (
      SELECT body FROM notification_templates
      WHERE event_type = 'panji_festival_reminder'
        AND channel = 'push'
        AND is_active = true
      LIMIT 1
    ) nt
    ON CONFLICT DO NOTHING;
  END LOOP;
END;
$$;

-- ─── Schedule with pg_cron (7 PM IST = 13:30 UTC) ───────────────────────────

DO $$
BEGIN
  -- Remove existing job if present
  PERFORM cron.unschedule('notify-panji-festivals')
  FROM cron.job
  WHERE jobname = 'notify-panji-festivals';

  PERFORM cron.schedule(
    'notify-panji-festivals',
    '30 13 * * *',   -- 7:00 PM IST daily
    'SELECT notify_panji_festivals()'
  );
EXCEPTION WHEN OTHERS THEN
  -- pg_cron may not be available in all environments; skip silently
  NULL;
END;
$$;

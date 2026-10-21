/*
# Customization Order Notifications — Schema + Templates

## Purpose
Support automatic Push and In-App notifications to the respective customer when:
1. A customization order is placed (event: custom_order_placed)
2. A customization payment is verified (event: custom_order_payment_success)

## Changes

### 1. New columns on `notification_logs`
- `custom_order_id` (uuid, nullable) — links the log to a custom_orders row
  so we can dedup: if a row already exists for (user_id, event_type,
  custom_order_id, channel), a second send is skipped.

### 2. New columns on `in_app_notifications`
- `related_custom_order_id` (uuid, nullable, FK → custom_orders) — lets the
  notification feed deep-link the customer to the custom order detail screen.

### 3. New event type
- `custom_order_payment_success` added to the notification_templates
  event_type CHECK constraint.

### 4. Active notification templates (is_active = true)
Inserts four templates with the exact message bodies requested:
- custom_order_placed (push) — title "🌸 Custom Order Received"
- custom_order_placed (in_app) — title "🌸 Custom Order Received"
- custom_order_payment_success (push) — title "🌸 Payment Successful",
  body contains ₹{{amount}} placeholder
- custom_order_payment_success (in_app) — title "🌸 Payment Successful",
  body contains ₹{{amount}} placeholder

### 5. Dedup index
- Index on notification_logs (user_id, event_type, custom_order_id, channel)
  to make the dedup lookup fast.

## Security
- No new tables. New columns inherit existing RLS policies.
- The service role (used by edge functions) bypasses RLS, so inserts into
  notification_logs and in_app_notifications continue to work as before.
*/

-- ============================================================
-- 1. Add custom_order_id to notification_logs
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'notification_logs' AND column_name = 'custom_order_id'
  ) THEN
    ALTER TABLE notification_logs
      ADD COLUMN custom_order_id uuid;
  END IF;
END $$;

-- ============================================================
-- 2. Add related_custom_order_id to in_app_notifications
-- ============================================================
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'in_app_notifications' AND column_name = 'related_custom_order_id'
  ) THEN
    ALTER TABLE in_app_notifications
      ADD COLUMN related_custom_order_id uuid
      REFERENCES custom_orders(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ============================================================
-- 3. Dedup index on notification_logs
-- ============================================================
CREATE INDEX IF NOT EXISTS notification_logs_custom_order_dedup_idx
  ON notification_logs (user_id, event_type, custom_order_id, channel)
  WHERE custom_order_id IS NOT NULL;

-- ============================================================
-- 4. Add custom_order_payment_success to event_type CHECK
-- ============================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'notification_templates_event_type_check'
  ) THEN
    ALTER TABLE notification_templates
      DROP CONSTRAINT notification_templates_event_type_check;
  END IF;

  ALTER TABLE notification_templates
    ADD CONSTRAINT notification_templates_event_type_check CHECK (
      event_type IN (
        'subscription_expiring_3days', 'subscription_expiring_1day',
        'subscription_expired', 'subscription_renewed', 'subscription_activated',
        'subscription_paused', 'payment_pending', 'payment_received', 'renewal_due',
        'order_dispatched', 'order_delivered', 'panji_festival_reminder',
        'panji_daily_digest', 'subscription_pending', 'heavy_rainfall',
        'early_delivery', 'booking_request_sent', 'booking_pandit_accepted',
        'booking_awaiting_advance', 'booking_confirmed_customer',
        'booking_confirmed_pandit', 'booking_pandit_on_the_way',
        'booking_pandit_arrived', 'booking_pooja_started',
        'booking_pooja_completed', 'booking_payment_completed_pandit',
        'booking_payment_completed_customer', 'booking_settled',
        'item_unavailable', 'custom',
        'subscription_expiring_5days', 'subscription_expiring_today',
        'subscription_expired_1day', 'subscription_expired_3days',
        'subscription_expired_5days', 'subscription_expired_10days',
        'subscription_expired_15days', 'subscription_expired_30days',
        'subscription_expired_90days', 'subscription_expired_180days',
        'subscription_starting_tomorrow', 'subscription_resuming_tomorrow',
        'custom_order_placed', 'custom_order_priced', 'custom_order_delivered',
        'custom_order_payment_success',
        'special_info', 'festival_greeting', 'marketing_promo',
        'vendor_procurement_order', 'vendor_payment_received', 'vendor_welcome',
        'admin_custom_order_alert', 'admin_unassigned_alert',
        'admin_rider_no_show', 'admin_vendor_payment_overdue',
        'admin_cron_failure', 'admin_daily_digest'
      )
    );
END $$;

-- ============================================================
-- 5. Seed active templates for custom order notifications
-- ============================================================
-- These are is_active = true so the send-notification edge function
-- finds them immediately. They use the exact message bodies requested.

INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body, recipient_type, priority, sound_enabled, reminder_stage, send_at_days_before)
VALUES
  ('Custom Order Placed (Push)', 'custom_order_placed', 'push', true, false,
   '🌸 Custom Order Received',
   'Your customization order has been received successfully! Our team will review your request and set the price. Once the price is confirmed, please complete the payment so we can proceed with your order. – Team 33 Crores',
   'customer', 'normal', false, null, null),
  ('Custom Order Placed (In-App)', 'custom_order_placed', 'in_app', true, false,
   '🌸 Custom Order Received',
   'Your customization order has been received successfully! Our team will review your request and set the price. Once the price is confirmed, please complete the payment so we can proceed with your order. – Team 33 Crores',
   'customer', 'normal', false, null, null),
  ('Custom Order Payment Success (Push)', 'custom_order_payment_success', 'push', true, false,
   '🌸 Payment Successful',
   'Payment Successful! We have received your payment of ₹{{amount}} for your customization order. Thank you! – Team 33 Crores',
   'customer', 'normal', false, null, null),
  ('Custom Order Payment Success (In-App)', 'custom_order_payment_success', 'in_app', true, false,
   '🌸 Payment Successful',
   'Payment Successful! We have received your payment of ₹{{amount}} for your customization order. Thank you! – Team 33 Crores',
   'customer', 'normal', false, null, null)
ON CONFLICT DO NOTHING;

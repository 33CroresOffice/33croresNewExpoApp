/*
# Add custom-order cancellation notifications

## Purpose
When an administrator cancels a customization order, the customer receives the
same cancellation message through Push and In-App notifications.

## Changes
1. Add `custom_order_cancelled` to the allowed notification event types.
2. Add active Push and In-App templates for the cancellation event.
3. The templates use `{{reason}}`, which is filled from the order's Admin Note
   at the moment the administrator cancels the order.

## Data and history
- No customer orders are deleted or changed by this migration.
- Existing notification history remains unchanged.
- The existing `notification_logs.custom_order_id` deduplication lookup is used
  by the notification service to prevent duplicate sends per channel.

## Security
- No new tables, policies, or grants are introduced.
- Existing notification service permissions and RLS behavior are unchanged.
*/

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'notification_templates_event_type_check'
      AND conrelid = 'public.notification_templates'::regclass
  ) THEN
    ALTER TABLE public.notification_templates
      DROP CONSTRAINT notification_templates_event_type_check;
  END IF;

  ALTER TABLE public.notification_templates
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
        'booking_payment_completed_customer', 'booking_settled', 'item_unavailable',
        'custom', 'subscription_expiring_5days', 'subscription_expiring_today',
        'subscription_expired_1day', 'subscription_expired_3days',
        'subscription_expired_5days', 'subscription_expired_10days',
        'subscription_expired_15days', 'subscription_expired_30days',
        'subscription_expired_90days', 'subscription_expired_180days',
        'subscription_starting_tomorrow', 'subscription_resuming_tomorrow',
        'custom_order_placed', 'custom_order_priced', 'custom_order_delivered',
        'custom_order_payment_success', 'custom_order_cancelled',
        'special_info', 'festival_greeting', 'marketing_promo',
        'vendor_procurement_order', 'vendor_payment_received', 'vendor_welcome',
        'admin_custom_order_alert', 'admin_unassigned_alert',
        'admin_rider_no_show', 'admin_vendor_payment_overdue',
        'admin_cron_failure', 'admin_daily_digest'
      )
    );
END $$;

INSERT INTO public.notification_templates
  (name, event_type, channel, is_active, is_automated, subject, body,
   recipient_type, priority, sound_enabled, reminder_stage, send_at_days_before)
SELECT
  'Custom Order Cancelled (Push)',
  'custom_order_cancelled',
  'push',
  true,
  false,
  'Customization order cancelled',
  '❌ Your customization order has been cancelled. Reason: {{reason}}. – Team 33 Crores',
  'customer',
  'normal',
  false,
  null,
  null
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
  WHERE event_type = 'custom_order_cancelled' AND channel = 'push'
);

INSERT INTO public.notification_templates
  (name, event_type, channel, is_active, is_automated, subject, body,
   recipient_type, priority, sound_enabled, reminder_stage, send_at_days_before)
SELECT
  'Custom Order Cancelled (In-App)',
  'custom_order_cancelled',
  'in_app',
  true,
  false,
  'Customization order cancelled',
  '❌ Your customization order has been cancelled. Reason: {{reason}}. – Team 33 Crores',
  'customer',
  'normal',
  false,
  null,
  null
WHERE NOT EXISTS (
  SELECT 1 FROM public.notification_templates
  WHERE event_type = 'custom_order_cancelled' AND channel = 'in_app'
);
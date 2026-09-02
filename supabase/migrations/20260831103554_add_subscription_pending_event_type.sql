/*
# Add subscription_pending event type to notification templates

1. Changes
- Expands the `notification_templates_event_type_check` constraint to include `subscription_pending`.
- This allows a new WhatsApp template for reminding logged-in customers who haven't subscribed after 24 hours.
2. Security
- No RLS or policy changes — only a check constraint modification.
3. Notes
- The constraint is dropped and recreated to add the new value idempotently.
*/

ALTER TABLE notification_templates DROP CONSTRAINT IF EXISTS notification_templates_event_type_check;

ALTER TABLE notification_templates ADD CONSTRAINT notification_templates_event_type_check
CHECK (event_type = ANY (ARRAY[
  'subscription_expiring_3days',
  'subscription_expiring_1day',
  'subscription_expired',
  'subscription_renewed',
  'subscription_activated',
  'subscription_paused',
  'subscription_pending',
  'payment_pending',
  'payment_received',
  'renewal_due',
  'order_dispatched',
  'order_delivered',
  'panji_festival_reminder',
  'panji_daily_digest',
  'custom'
]));

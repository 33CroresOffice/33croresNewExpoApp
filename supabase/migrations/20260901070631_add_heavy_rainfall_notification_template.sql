/*
# Add "heavy_rainfall" notification template

1. Schema Changes
- Add 'heavy_rainfall' to the event_type CHECK constraint on notification_templates so admins can create and filter templates by this event.

2. Seed Data
- Insert a new notification_templates row for the "heavy_rainfall" WhatsApp template (MSG91 template id 525516, namespace 73669fdc_d75e_4db4_a7b8_1cf1ed246b43).
- Channel: whatsapp, variable: customer_name.
- Body text matches the approved MSG91 template exactly.

3. Security
- No RLS policy changes. Existing notification admin policies already govern this table.
*/

-- Expand the event_type check to include heavy_rainfall (preserving all existing values)
ALTER TABLE notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_event_type_check;

ALTER TABLE notification_templates
  ADD CONSTRAINT notification_templates_event_type_check
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
    'heavy_rainfall',
    'custom'
  ]));

-- Seed the heavy_rainfall WhatsApp template (idempotent)
INSERT INTO notification_templates (
  name,
  event_type,
  channel,
  is_active,
  body,
  msg91_whatsapp_template_id,
  msg91_whatsapp_namespace,
  msg91_whatsapp_variables
)
SELECT
  'Heavy Rainfall Delivery Delay',
  'heavy_rainfall',
  'whatsapp',
  true,
  'Dear {{customer_name}}, we sincerely apologize for the delay in your flower delivery today. Due to heavy rainfall in your area, our rider is facing difficulty in reaching you on time. We assure you your order is on its way and will be delivered as soon as conditions improve. Thank you for your patience and understanding. – Team 33 Crores',
  '525516',
  '73669fdc_d75e_4db4_a7b8_1cf1ed246b43',
  '["customer_name"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM notification_templates
  WHERE event_type = 'heavy_rainfall' AND channel = 'whatsapp'
);

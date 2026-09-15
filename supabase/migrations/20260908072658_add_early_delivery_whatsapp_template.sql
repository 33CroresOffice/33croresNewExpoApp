/*
# Add early_delivery event type and approved WhatsApp template

1. Purpose
- Adds the approved MSG91 WhatsApp template used when flowers are delivered earlier than usual for a customer's special occasion.
- Extends the notification_templates event_type CHECK constraint to allow the new `early_delivery` event type.

2. Schema change
- Drops the existing `notification_templates_event_type_check` constraint.
- Recreates it with all existing values plus `early_delivery`.

3. Notification template
- `name`: Early Delivery – Special Occasion
- `event_type`: early_delivery
- `channel`: whatsapp
- `body`: approved customer-facing message with the `customer_name` placeholder.
- `msg91_template_id`: approved MSG91 template ID 525521.
- `msg91_whatsapp_template_id`: early_delivery.
- `msg91_whatsapp_namespace`: 73669fdc_d75e_4db4_a7b8_1cf1ed246b43.
- `msg91_whatsapp_variables`: customer_name.

4. Safety
- Inserts only when an active matching template does not already exist.
- Does not modify or remove existing templates, customer data, or notification history.
*/

ALTER TABLE public.notification_templates
  DROP CONSTRAINT IF EXISTS notification_templates_event_type_check;

ALTER TABLE public.notification_templates
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
    'early_delivery',
    'custom'
  ]::text[]));

INSERT INTO public.notification_templates (
  name,
  event_type,
  channel,
  is_active,
  is_automated,
  subject,
  body,
  msg91_template_id,
  msg91_whatsapp_template_id,
  msg91_whatsapp_namespace,
  msg91_whatsapp_variables
)
SELECT
  'Early Delivery – Special Occasion',
  'early_delivery',
  'whatsapp',
  true,
  true,
  NULL,
  'Dear {{customer_name}}, to help you celebrate your special occasion, we are delivering your flowers earlier than usual today. Please ensure someone is available to receive them. We wish you a wonderful celebration! – Team 33 Crores',
  '525521',
  'early_delivery',
  '73669fdc_d75e_4db4_a7b8_1cf1ed246b43',
  '["customer_name"]'::jsonb
WHERE NOT EXISTS (
  SELECT 1
  FROM public.notification_templates
  WHERE event_type = 'early_delivery'
    AND channel = 'whatsapp'
    AND msg91_whatsapp_template_id = 'early_delivery'
);
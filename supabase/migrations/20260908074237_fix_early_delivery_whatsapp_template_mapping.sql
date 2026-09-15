/*
# Fix early delivery WhatsApp template selection

1. Purpose
- Prevents the duplicate custom early-delivery WhatsApp template from appearing in the notification picker.
- Ensures any previously selected copy uses the approved named `customer_name` component.

2. Safety
- Updates only templates matching the approved early-delivery WhatsApp template name and template ID.
- Keeps the canonical `early_delivery` template active.
- Does not delete rows or notification history.
*/

UPDATE public.notification_templates
SET
  msg91_whatsapp_variables = '["customer_name"]'::jsonb,
  updated_at = now()
WHERE name = 'Early Delivery – Special Occasion'
  AND channel = 'whatsapp'
  AND msg91_whatsapp_template_id = 'early_delivery';

UPDATE public.notification_templates
SET
  is_active = false,
  updated_at = now()
WHERE name = 'Early Delivery – Special Occasion'
  AND event_type = 'custom'
  AND channel = 'whatsapp'
  AND msg91_whatsapp_template_id = 'early_delivery';
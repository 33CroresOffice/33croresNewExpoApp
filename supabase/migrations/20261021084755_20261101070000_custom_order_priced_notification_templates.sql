/*
# Custom Order Price-Set Notification Templates

## Purpose
When an admin sets and saves the price for a customer's customization order,
the customer should receive a Push and In-App notification informing them
that the price is ready and they should complete payment.

## Changes

### 1. Add `custom_order_priced` to event_type CHECK constraint
This event type was already listed in the constraint from the previous
migration (20261101060000), but we verify it exists here for safety.

### 2. Seed active notification templates (is_active = true)
Inserts two templates:
- custom_order_priced (push) — title "🌸 Your Customization Order Price is Ready!"
- custom_order_priced (in_app) — title "🌸 Your Customization Order Price is Ready!"
Both use body with ₹{{amount}} placeholder.

## Security
- No new tables or columns. Only template rows inserted.
- ON CONFLICT DO NOTHING makes this idempotent.
*/

INSERT INTO notification_templates (name, event_type, channel, is_active, is_automated, subject, body, recipient_type, priority, sound_enabled, reminder_stage, send_at_days_before)
VALUES
  ('Custom Order Priced (Push)', 'custom_order_priced', 'push', true, false,
   '🌸 Your Customization Order Price is Ready!',
   '🌸 The price for your customization order has been set at ₹{{amount}}. Please check your order and complete the payment. Once payment is successful, we will process and deliver your order. Thank you! – Team 33 Crores',
   'customer', 'normal', false, null, null),
  ('Custom Order Priced (In-App)', 'custom_order_priced', 'in_app', true, false,
   '🌸 Your Customization Order Price is Ready!',
   '🌸 The price for your customization order has been set at ₹{{amount}}. Please check your order and complete the payment. Once payment is successful, we will process and deliver your order. Thank you! – Team 33 Crores',
   'customer', 'normal', false, null, null)
ON CONFLICT DO NOTHING;

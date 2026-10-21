/*
# Fix Custom Order Price Notification Placeholders

## Purpose
Correct the active Push and In-App notification templates used after an admin
sets a customization order price. The previous templates used the wrong
amount variable and the Push template had an incomplete customer-name token.

## Changes

### Modified notification templates
- `custom_order_priced` / `push`
  - Corrects `{{customer_name}}` syntax.
  - Changes `{{total_price}}` to `{{amount}}`.
  - Keeps the existing customer-facing wording.
- `custom_order_priced` / `in_app`
  - Changes `{{total_price}}` to `{{amount}}`.
  - Keeps the existing customer-facing wording.

## Security
- No new tables, columns, permissions, or policies.
- Recipient and amount are still resolved by the deployed notification
  function from the referenced custom order and its customer profile.

## Important Notes
1. The `amount` value is the saved flower price plus delivery charge,
   formatted in Indian rupees by the notification function.
2. The `customer_name` value is loaded from the recipient's profile.
3. The updates are scoped to the active templates for this event and channel.
*/

UPDATE notification_templates
SET
  subject = 'Your custom order is priced',
  body = 'Hi {{customer_name}}, your custom order has been priced at Rs. {{amount}}. Please complete the payment to confirm your order.',
  updated_at = now()
WHERE event_type = 'custom_order_priced'
  AND channel = 'push'
  AND is_active = true;

UPDATE notification_templates
SET
  subject = 'Your custom order is priced',
  body = 'Your custom order has been priced at Rs. {{amount}}. Please complete the payment to confirm your order.',
  updated_at = now()
WHERE event_type = 'custom_order_priced'
  AND channel = 'in_app'
  AND is_active = true;
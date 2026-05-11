/*
  # Update custom_orders status flow

  ## Summary
  Adds 'paid' as a valid status value and aligns the status flow with the business logic:
  - pending: order just created by customer
  - confirmed: admin has set the price
  - paid: customer has completed payment
  - out_for_delivery: admin dispatches the order
  - delivered: order delivered
  - cancelled: order cancelled

  ## Changes
  - Drops and recreates the status CHECK constraint to include 'paid'
*/

ALTER TABLE custom_orders DROP CONSTRAINT IF EXISTS custom_orders_status_check;

ALTER TABLE custom_orders ADD CONSTRAINT custom_orders_status_check
  CHECK (status IN ('pending', 'confirmed', 'paid', 'out_for_delivery', 'delivered', 'cancelled'));

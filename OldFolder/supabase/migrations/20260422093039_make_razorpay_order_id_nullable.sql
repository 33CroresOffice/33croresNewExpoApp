/*
  # Make razorpay_order_id nullable in payments

  Admin-created subscriptions paid via cash, bank transfer, or other
  offline modes do not have a Razorpay order ID. This column should
  be nullable to support those payment modes.
*/

ALTER TABLE payments ALTER COLUMN razorpay_order_id DROP NOT NULL;

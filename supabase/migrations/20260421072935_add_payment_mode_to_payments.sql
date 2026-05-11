/*
  # Add payment_mode to payments table

  Adds an optional payment_mode column to track how a payment was made
  (cash, upi, bank_transfer, card, cheque) for admin-created subscriptions.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'payments' AND column_name = 'payment_mode'
  ) THEN
    ALTER TABLE payments ADD COLUMN payment_mode text DEFAULT 'upi';
  END IF;
END $$;

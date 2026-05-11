/*
  # Add pricing and payment fields to custom_orders

  ## Summary
  Extends custom_orders to support admin-set pricing and customer payment tracking.
  The admin sets flower_price and delivery_price; the system computes total_price.
  Customers can then pay via Razorpay for their custom order.

  ## New Columns on custom_orders
  - `flower_price` (integer, paise) — admin-set flower cost
  - `delivery_price` (integer, paise) — admin-set delivery charge
  - `total_price` (integer, generated) — flower_price + delivery_price
  - `payment_status` (text) — 'unpaid' | 'pending' | 'paid'
  - `razorpay_order_id` (text, nullable) — Razorpay order ID for this custom order
  - `razorpay_payment_id` (text, nullable) — Razorpay payment ID after success
  - `prices_set_at` (timestamptz, nullable) — when admin set prices

  ## Security
  - Admin can update price fields via existing RLS (role = 'admin')
  - Customers can read payment_status, total_price (already covered by existing SELECT policy)
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'flower_price'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN flower_price integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'delivery_price'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN delivery_price integer DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'total_price'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN total_price integer GENERATED ALWAYS AS (flower_price + delivery_price) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN payment_status text NOT NULL DEFAULT 'unpaid'
      CHECK (payment_status IN ('unpaid', 'pending', 'paid'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'razorpay_order_id'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN razorpay_order_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'razorpay_payment_id'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN razorpay_payment_id text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'custom_orders' AND column_name = 'prices_set_at'
  ) THEN
    ALTER TABLE custom_orders ADD COLUMN prices_set_at timestamptz;
  END IF;
END $$;

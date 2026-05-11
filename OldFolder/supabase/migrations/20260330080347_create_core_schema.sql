/*
  # Core Schema for Flower Delivery Subscription App

  ## Overview
  This migration creates the complete database schema for the Flower Delivery
  monthly subscription application including customer and admin functionality.

  ## New Tables

  1. `profiles` - User profiles linked to Supabase Auth
     - id (uuid, PK, references auth.users)
     - mobile (text, unique - primary identity)
     - full_name, avatar_url, role (customer/admin)
     - notification preferences

  2. `otp_requests` - OTP audit log and rate limiting
     - Stores hashed OTPs with expiry
     - Tracks channel (sms/whatsapp) and usage

  3. `subscription_plans` - Available flower subscription plans
     - Name, description, price in INR paise
     - Delivery frequency and features JSON array

  4. `bouquets` - Flower bouquet catalogue
     - Name, description, image, category

  5. `plan_bouquet_options` - Many-to-many: plans and available bouquets

  6. `addresses` - Customer delivery addresses
     - Full address with pincode, default flag

  7. `subscriptions` - Active/paused/cancelled customer subscriptions
     - Links user, plan, address, default bouquet

  8. `subscription_customizations` - Per-delivery customizations
     - Allows swapping bouquet and adding special instructions

  9. `orders` - Individual delivery records
     - Status tracking from scheduled to delivered

  10. `payments` - Razorpay payment records
      - Stores order ID, payment ID, verification status

  ## Security
  - RLS enabled on all tables
  - Customers can only access their own data
  - Admins (role = 'admin') get full access via policy checks
*/

-- ─── PROFILES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  mobile text UNIQUE NOT NULL,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  is_verified boolean NOT NULL DEFAULT false,
  notification_sms boolean NOT NULL DEFAULT true,
  notification_whatsapp boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- ─── OTP REQUESTS ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS otp_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mobile text NOT NULL,
  otp_hash text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('sms', 'whatsapp')),
  expires_at timestamptz NOT NULL,
  is_used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE otp_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_otp_requests_mobile ON otp_requests(mobile);
CREATE INDEX IF NOT EXISTS idx_otp_requests_expires ON otp_requests(expires_at);

-- OTP requests are managed only via edge functions using service role
-- No direct client access needed

-- ─── SUBSCRIPTION PLANS ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price integer NOT NULL CHECK (price > 0),
  frequency text NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly')),
  deliveries_per_month integer NOT NULL DEFAULT 1,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  features jsonb NOT NULL DEFAULT '[]',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active plans"
  ON subscription_plans FOR SELECT
  TO authenticated
  USING (is_active = true OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Admins can insert plans"
  ON subscription_plans FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Admins can update plans"
  ON subscription_plans FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── BOUQUETS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bouquets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url text,
  category text NOT NULL CHECK (category IN ('roses', 'mixed', 'seasonal', 'exotic', 'sunflowers', 'lilies')),
  is_available boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE bouquets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view available bouquets"
  ON bouquets FOR SELECT
  TO authenticated
  USING (is_available = true OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Admins can insert bouquets"
  ON bouquets FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can update bouquets"
  ON bouquets FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── PLAN BOUQUET OPTIONS ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS plan_bouquet_options (
  plan_id uuid NOT NULL REFERENCES subscription_plans(id) ON DELETE CASCADE,
  bouquet_id uuid NOT NULL REFERENCES bouquets(id) ON DELETE CASCADE,
  PRIMARY KEY (plan_id, bouquet_id)
);

ALTER TABLE plan_bouquet_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view plan bouquet options"
  ON plan_bouquet_options FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage plan bouquet options"
  ON plan_bouquet_options FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Admins can delete plan bouquet options"
  ON plan_bouquet_options FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── ADDRESSES ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  street text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  pincode text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE addresses ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

CREATE POLICY "Users can view own addresses"
  ON addresses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Users can insert own addresses"
  ON addresses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own addresses"
  ON addresses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own addresses"
  ON addresses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES subscription_plans(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'cancelled')),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  next_delivery_date date,
  pause_until date,
  delivery_address_id uuid REFERENCES addresses(id),
  default_bouquet_id uuid REFERENCES bouquets(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Users can insert own subscriptions"
  ON subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own subscriptions"
  ON subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ))
  WITH CHECK (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- ─── SUBSCRIPTION CUSTOMIZATIONS ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS subscription_customizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  delivery_date date NOT NULL,
  selected_bouquet_id uuid NOT NULL REFERENCES bouquets(id),
  special_instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(subscription_id, delivery_date)
);

ALTER TABLE subscription_customizations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_customizations_subscription_id ON subscription_customizations(subscription_id);

CREATE POLICY "Users can view own customizations"
  ON subscription_customizations FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Users can insert own customizations"
  ON subscription_customizations FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ));

CREATE POLICY "Users can update own customizations"
  ON subscription_customizations FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM subscriptions s WHERE s.id = subscription_id AND s.user_id = auth.uid()
  ));

-- ─── ORDERS ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'out_for_delivery', 'delivered', 'failed')),
  delivered_at timestamptz,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_scheduled_date ON orders(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Admins can insert orders"
  ON orders FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Admins can update orders"
  ON orders FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- ─── PAYMENTS ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES subscriptions(id),
  razorpay_order_id text NOT NULL,
  razorpay_payment_id text,
  amount integer NOT NULL CHECK (amount > 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_razorpay_order_id ON payments(razorpay_order_id);

CREATE POLICY "Users can view own payments"
  ON payments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Users can insert own payments"
  ON payments FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── TRIGGER: updated_at on profiles ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

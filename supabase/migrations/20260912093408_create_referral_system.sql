
-- Referral configuration (admin-controlled)
CREATE TABLE referral_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL DEFAULT 'Refer a Rider',
  reward_amount numeric(10,2) NOT NULL DEFAULT 500,
  required_completion_days integer NOT NULL DEFAULT 30,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE referral_config ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "admin_all_referral_config" ON referral_config
  FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','super_admin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','super_admin'));

-- Riders/customers can read active config
CREATE POLICY "rider_read_referral_config" ON referral_config
  FOR SELECT TO authenticated USING (true);

-- Seed a default config
INSERT INTO referral_config (title, reward_amount, required_completion_days, is_active)
VALUES ('Refer a Rider & Earn', 500, 30, true);

-- Rider referrals tracking
CREATE TABLE rider_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_rider_id uuid NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  referred_mobile text NOT NULL,
  referred_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','completed','expired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE rider_referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rider_select_own_referrals" ON rider_referrals
  FOR SELECT TO authenticated
  USING (referrer_rider_id IN (
    SELECT id FROM riders WHERE profile_id = auth.uid()
  ));

CREATE POLICY "rider_insert_own_referrals" ON rider_referrals
  FOR INSERT TO authenticated
  WITH CHECK (referrer_rider_id IN (
    SELECT id FROM riders WHERE profile_id = auth.uid()
  ));

CREATE POLICY "admin_all_referrals" ON rider_referrals
  FOR ALL TO authenticated
  USING ((auth.jwt()->'app_metadata'->>'role') IN ('admin','super_admin'))
  WITH CHECK ((auth.jwt()->'app_metadata'->>'role') IN ('admin','super_admin'));

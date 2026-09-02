-- Allow riders to read all active subscriptions and related customer data
-- so the rider app's "Today's Orders" section shows the same data as the
-- admin "Today Delivery" filter.

-- Riders can SELECT all active subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Riders can view active subscriptions'
  ) THEN
    CREATE POLICY "Riders can view active subscriptions"
      ON subscriptions FOR SELECT
      TO authenticated
      USING (
        status = 'active'
        AND EXISTS (
          SELECT 1 FROM riders r WHERE r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Riders can SELECT profiles of customers who have active subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Riders can view active subscription customers'
  ) THEN
    CREATE POLICY "Riders can view active subscription customers"
      ON profiles FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM subscriptions s
          WHERE s.user_id = profiles.id
            AND s.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM riders r WHERE r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Riders can SELECT addresses linked to active subscriptions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'addresses' AND policyname = 'Riders can view active subscription addresses'
  ) THEN
    CREATE POLICY "Riders can view active subscription addresses"
      ON addresses FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM subscriptions s
          WHERE s.delivery_address_id = addresses.id
            AND s.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM riders r WHERE r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Riders can SELECT all orders for active subscriptions (not just assigned ones)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Riders can view active subscription orders'
  ) THEN
    CREATE POLICY "Riders can view active subscription orders"
      ON orders FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM subscriptions s
          WHERE s.id = orders.subscription_id
            AND s.status = 'active'
        )
        AND EXISTS (
          SELECT 1 FROM riders r WHERE r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

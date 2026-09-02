
/*
  # Rider SELECT access for assigned delivery data

  Riders (authenticated users with a corresponding `riders.profile_id`) currently
  can view rows in `rider_order_assignments`, but existing RLS policies prevent
  them from reading the related `orders`, `profiles`, `subscriptions`, and
  `addresses` rows for their assignments. This causes the rider dashboard and
  delivery list to render blank customer and address fields.

  1. Policies Added
    - `orders`: riders can SELECT orders assigned to them via rider_order_assignments
    - `profiles`: riders can SELECT customer profile for an order assigned to them
    - `subscriptions`: riders can SELECT subscription for an order assigned to them
    - `addresses`: riders can SELECT delivery address tied to those subscriptions
    - `subscription_plans`: already public if active; no change required

  2. Security
    - Each policy restricts to `authenticated` role only
    - Each policy verifies an assignment row exists linking the rider's profile_id
      (via riders.profile_id = auth.uid()) to the target order
    - No policy uses `USING (true)`; all enforce ownership/relationship
*/

-- orders: rider can read orders that are assigned to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'orders' AND policyname = 'Riders can view assigned orders'
  ) THEN
    CREATE POLICY "Riders can view assigned orders"
      ON orders FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM rider_order_assignments roa
          JOIN riders r ON r.id = roa.rider_id
          WHERE roa.order_id = orders.id
            AND r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- profiles: rider can read customer profile if customer has an order assigned to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'profiles' AND policyname = 'Riders can view assigned customer profiles'
  ) THEN
    CREATE POLICY "Riders can view assigned customer profiles"
      ON profiles FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM orders o
          JOIN rider_order_assignments roa ON roa.order_id = o.id
          JOIN riders r ON r.id = roa.rider_id
          WHERE o.user_id = profiles.id
            AND r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- subscriptions: rider can read subscription linked to an order assigned to them
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Riders can view assigned subscriptions'
  ) THEN
    CREATE POLICY "Riders can view assigned subscriptions"
      ON subscriptions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM orders o
          JOIN rider_order_assignments roa ON roa.order_id = o.id
          JOIN riders r ON r.id = roa.rider_id
          WHERE o.subscription_id = subscriptions.id
            AND r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

-- addresses: rider can read delivery address tied to an assigned order's subscription
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'addresses' AND policyname = 'Riders can view assigned delivery addresses'
  ) THEN
    CREATE POLICY "Riders can view assigned delivery addresses"
      ON addresses FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM subscriptions s
          JOIN orders o ON o.subscription_id = s.id
          JOIN rider_order_assignments roa ON roa.order_id = o.id
          JOIN riders r ON r.id = roa.rider_id
          WHERE s.delivery_address_id = addresses.id
            AND r.profile_id = auth.uid()
        )
      );
  END IF;
END $$;

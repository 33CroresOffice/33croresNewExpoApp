/*
  # Seed Renewal Test Data

  ## Summary
  Inserts three test subscriptions for the customer "test name" to demonstrate
  all three renewal states in the customer UI:

  1. Expiring Soon (warning banner) — end_date = today + 3 days, status active
  2. Grace Period (grace banner) — end_date = yesterday, status active
  3. Expired (expired banner) — status = expired, end_date = 5 days ago
*/

INSERT INTO subscriptions (
  user_id, plan_id, status, start_date, end_date, next_delivery_date,
  delivery_address_id, renewal_status
)
VALUES
  (
    '93f19bfa-58f0-420c-b311-bdaa93927f03',
    'a1b2c3d4-0001-0001-0001-000000000001',
    'active',
    CURRENT_DATE - INTERVAL '27 days',
    CURRENT_DATE + INTERVAL '3 days',
    CURRENT_DATE + INTERVAL '1 day',
    '62d4186a-6da4-41c0-9bb1-ec0e1ba4a615',
    'none'
  ),
  (
    '93f19bfa-58f0-420c-b311-bdaa93927f03',
    'a1b2c3d4-0002-0002-0002-000000000002',
    'active',
    CURRENT_DATE - INTERVAL '32 days',
    CURRENT_DATE - INTERVAL '1 day',
    CURRENT_DATE - INTERVAL '1 day',
    '62d4186a-6da4-41c0-9bb1-ec0e1ba4a615',
    'notified'
  ),
  (
    '93f19bfa-58f0-420c-b311-bdaa93927f03',
    'a1b2c3d4-0003-0003-0003-000000000003',
    'expired',
    CURRENT_DATE - INTERVAL '40 days',
    CURRENT_DATE - INTERVAL '5 days',
    NULL,
    '62d4186a-6da4-41c0-9bb1-ec0e1ba4a615',
    'expired'
  );

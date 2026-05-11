/*
  # Seed Rider Assignment Test Data

  This migration inserts dummy data to test the Smart Rider Assignment feature.

  ## What's included:
  1. 4 Riders with different zones, vehicles, and rates
  2. 6 Orders scheduled for today (2026-04-01)
  3. Rider attendance for today (mix of present and leave)
  4. Rider leave requests (1 approved for today, 1 pending)
  5. Rider performance snapshots (last 7 days) for smart scoring
  6. 2 existing rider_order_assignments (one assigned, one out_for_delivery)

  ## Riders:
  - Arjun Sharma: North zone, bike, high performer
  - Priya Mehta: South zone, scooter, medium performer
  - Karan Singh: East zone, bike, on leave today (triggers reassignment queue)
  - Dev Patel: West zone, bicycle, new rider

  ## Notes:
  - Karan's approved leave today + his active assignment triggers the orange banner
  - Today's unassigned orders appear in the assignment queue
*/

DO $$
DECLARE
  rider1_id uuid := gen_random_uuid();
  rider2_id uuid := gen_random_uuid();
  rider3_id uuid := gen_random_uuid();
  rider4_id uuid := gen_random_uuid();

  sub1_id uuid := '68bae3ae-d441-421b-8e2f-58a76ea0b894';
  sub2_id uuid := 'db10f7c9-bdf7-43dc-9b4a-0d2aad631783';
  user1_id uuid := '93f19bfa-58f0-420c-b311-bdaa93927f03';
  user2_id uuid := 'd03ad1a3-9b80-4ebd-992b-d04415db6eaf';

  order1_id uuid := gen_random_uuid();
  order2_id uuid := gen_random_uuid();
  order3_id uuid := gen_random_uuid();
  order4_id uuid := gen_random_uuid();
  order5_id uuid := gen_random_uuid();
  order6_id uuid := gen_random_uuid();

BEGIN

  -- Insert 4 riders
  INSERT INTO riders (id, full_name, mobile, vehicle_type, vehicle_number, zone, is_active, joining_date, daily_rate, per_delivery_rate, notes)
  VALUES
    (rider1_id, 'Arjun Sharma',  '9876540001', 'bike',    'MH01AB1234', 'North', true, '2025-06-01', 500, 30, 'Senior rider, very reliable'),
    (rider2_id, 'Priya Mehta',   '9876540002', 'scooter', 'MH01CD5678', 'South', true, '2025-09-15', 450, 28, 'Punctual, good with customers'),
    (rider3_id, 'Karan Singh',   '9876540003', 'bike',    'MH01EF9012', 'East',  true, '2025-11-01', 450, 28, 'On approved leave today'),
    (rider4_id, 'Dev Patel',     '9876540004', 'bicycle', NULL,          'West',  true, '2026-02-01', 350, 20, 'New rider, still building track record')
  ON CONFLICT (mobile) DO NOTHING;

  -- Insert 6 orders for today using existing subscriptions/users
  INSERT INTO orders (id, subscription_id, user_id, scheduled_date, status)
  VALUES
    (order1_id, sub1_id, user1_id, CURRENT_DATE, 'scheduled'),
    (order2_id, sub1_id, user1_id, CURRENT_DATE, 'scheduled'),
    (order3_id, sub2_id, user2_id, CURRENT_DATE, 'scheduled'),
    (order4_id, sub2_id, user2_id, CURRENT_DATE, 'scheduled'),
    (order5_id, sub1_id, user1_id, CURRENT_DATE, 'out_for_delivery'),
    (order6_id, sub2_id, user2_id, CURRENT_DATE, 'scheduled')
  ON CONFLICT DO NOTHING;

  -- Attendance for today
  INSERT INTO rider_attendance (rider_id, date, status, notes)
  VALUES
    (rider1_id, CURRENT_DATE, 'present',  'Checked in on time'),
    (rider2_id, CURRENT_DATE, 'present',  'Checked in on time'),
    (rider3_id, CURRENT_DATE, 'leave',    'Approved leave'),
    (rider4_id, CURRENT_DATE, 'present',  'Checked in on time')
  ON CONFLICT DO NOTHING;

  -- Approved leave for Karan (rider3) for today — triggers the orange banner
  INSERT INTO rider_leave_requests (rider_id, leave_date, reason, status, covered_by_rider_id)
  VALUES
    (rider3_id, CURRENT_DATE, 'Family function', 'approved', rider1_id)
  ON CONFLICT DO NOTHING;

  -- Pending leave request from Dev for tomorrow
  INSERT INTO rider_leave_requests (rider_id, leave_date, reason, status)
  VALUES
    (rider4_id, CURRENT_DATE + 1, 'Medical appointment', 'pending')
  ON CONFLICT DO NOTHING;

  -- Performance snapshots for the last 7 days (used in smart scoring)
  INSERT INTO rider_performance_snapshots (rider_id, snapshot_date, deliveries_assigned, deliveries_completed, deliveries_failed, success_rate, avg_delivery_minutes)
  VALUES
    -- Arjun: excellent performer
    (rider1_id, CURRENT_DATE - 1, 8, 8, 0, 100, 22),
    (rider1_id, CURRENT_DATE - 2, 7, 7, 0, 100, 20),
    (rider1_id, CURRENT_DATE - 3, 9, 8, 1, 89,  25),
    (rider1_id, CURRENT_DATE - 4, 6, 6, 0, 100, 21),
    (rider1_id, CURRENT_DATE - 5, 8, 8, 0, 100, 19),
    -- Priya: good performer
    (rider2_id, CURRENT_DATE - 1, 6, 6, 0, 100, 28),
    (rider2_id, CURRENT_DATE - 2, 5, 4, 1, 80,  30),
    (rider2_id, CURRENT_DATE - 3, 7, 7, 0, 100, 26),
    (rider2_id, CURRENT_DATE - 4, 6, 5, 1, 83,  32),
    (rider2_id, CURRENT_DATE - 5, 5, 5, 0, 100, 27),
    -- Karan: average performer (on leave today)
    (rider3_id, CURRENT_DATE - 1, 5, 4, 1, 80,  35),
    (rider3_id, CURRENT_DATE - 2, 6, 5, 1, 83,  33),
    (rider3_id, CURRENT_DATE - 3, 4, 4, 0, 100, 30),
    -- Dev: new, fewer data points
    (rider4_id, CURRENT_DATE - 1, 3, 3, 0, 100, 40),
    (rider4_id, CURRENT_DATE - 2, 2, 2, 0, 100, 38)
  ON CONFLICT DO NOTHING;

  -- Assign order5 to Karan (rider3, on leave) — triggers the reassignment queue orange banner
  INSERT INTO rider_order_assignments (rider_id, order_id, status, notes)
  VALUES
    (rider3_id, order5_id, 'assigned', 'Assigned before leave was flagged')
  ON CONFLICT DO NOTHING;

  -- Assign order1 to Arjun (normal active assignment)
  INSERT INTO rider_order_assignments (rider_id, order_id, status, notes)
  VALUES
    (rider1_id, order1_id, 'picked_up', 'Out for delivery')
  ON CONFLICT DO NOTHING;

END $$;

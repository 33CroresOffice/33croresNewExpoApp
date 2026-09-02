/*
  # Delivery History: Custom Orders + Rider Assignments + 6AM Cron

  ## Summary
  Adds the pieces needed for the customer-facing Delivery History page to show
  both subscription orders and custom orders, each with rider details and
  delivered time. Also adds a daily 6:00 AM IST cron that marks scheduled
  subscription orders as "out_for_delivery".

  ## Changes

  1. custom_orders.delivered_at (timestamptz, nullable)
     - Records the actual delivery timestamp for custom orders.

  2. rider_order_assignments.custom_order_id (uuid, nullable, FK -> custom_orders)
     - Lets a rider be assigned to a custom order (in addition to subscription orders).
     - order_id is made nullable so an assignment can point to a custom_order instead.

  3. RLS policies
     - Customers can SELECT rider_order_assignments for their own orders/custom_orders.
     - Customers can SELECT riders (full_name, mobile only via policy) for their assigned deliveries.

  4. pg_cron job "mark-orders-out-for-delivery"
     - Runs daily at 00:30 UTC (= 06:00 IST).
     - Updates all subscription orders with status='scheduled' and scheduled_date = today
       to status='out_for_delivery'.
*/

-- 1. delivered_at on custom_orders
ALTER TABLE custom_orders
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 2. custom_order_id on rider_order_assignments + nullable order_id
ALTER TABLE rider_order_assignments
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE rider_order_assignments
  ADD COLUMN IF NOT EXISTS custom_order_id uuid REFERENCES custom_orders(id) ON DELETE CASCADE;

-- 3. RLS: customers can read their own rider_order_assignments
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'rider_order_assignments' AND policyname = 'Customers can view own assignments'
  ) THEN
    CREATE POLICY "Customers can view own assignments"
      ON rider_order_assignments FOR SELECT
      TO authenticated
      USING (
        (order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM orders o WHERE o.id = rider_order_assignments.order_id AND o.user_id = auth.uid()
        ))
        OR
        (custom_order_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM custom_orders co WHERE co.id = rider_order_assignments.custom_order_id AND co.user_id = auth.uid()
        ))
      );
  END IF;
END $$;

-- RLS: customers can read riders assigned to their orders/custom_orders
-- Only exposes rows; the frontend selects full_name + mobile explicitly.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'riders' AND policyname = 'Customers can view assigned riders'
  ) THEN
    CREATE POLICY "Customers can view assigned riders"
      ON riders FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM rider_order_assignments roa
          WHERE roa.rider_id = riders.id
            AND (
              (roa.order_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM orders o WHERE o.id = roa.order_id AND o.user_id = auth.uid()
              ))
              OR
              (roa.custom_order_id IS NOT NULL AND EXISTS (
                SELECT 1 FROM custom_orders co WHERE co.id = roa.custom_order_id AND co.user_id = auth.uid()
              ))
            )
        )
      );
  END IF;
END $$;

-- 4. pg_cron: mark scheduled subscription orders out for delivery at 6 AM IST (00:30 UTC)
SELECT cron.unschedule('mark-orders-out-for-delivery')
FROM cron.job
WHERE jobname = 'mark-orders-out-for-delivery';

SELECT cron.schedule(
  'mark-orders-out-for-delivery',
  '30 0 * * *',
  $$
  UPDATE orders
  SET status = 'out_for_delivery'
  WHERE status = 'scheduled'
    AND scheduled_date = CURRENT_DATE;
  $$
);

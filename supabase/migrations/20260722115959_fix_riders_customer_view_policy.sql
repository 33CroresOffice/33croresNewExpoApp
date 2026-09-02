-- Also fix the "Customers can view assigned riders" policy on riders table
-- which subqueries rider_order_assignments -> orders, which is fine,
-- but the "Riders can view own profile" policy is already simple.
-- The main recursion was rider_order_assignments <-> riders.
-- Let's also simplify the riders "Customers can view assigned riders" policy
-- to use the SECURITY DEFINER function instead of subquerying rider_order_assignments.

DROP POLICY IF EXISTS "Customers can view assigned riders" ON riders;

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

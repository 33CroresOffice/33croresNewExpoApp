/*
# Allow admins to insert custom orders for any customer

1. Purpose
- The admin "Customize Order" page creates custom orders on behalf of customers.
- The existing INSERT policy only allows `auth.uid() = user_id`, which blocks admins
  from creating orders for other users. This adds a separate admin INSERT policy.

2. Modified Tables
- `custom_orders`
- Adds one new INSERT policy scoped to the admin JWT role.
- The existing customer INSERT policy is unchanged.

3. Security
- Only authenticated users with `app_metadata.role = 'admin'` can use this policy.
- The admin's own `auth.uid()` is NOT the customer's `user_id`, so the existing
  customer policy cannot cover this case.
- No other policies (SELECT, UPDATE, DELETE) are changed.
*/

DROP POLICY IF EXISTS "Admins can insert custom orders" ON custom_orders;

CREATE POLICY "Admins can insert custom orders"
  ON custom_orders FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
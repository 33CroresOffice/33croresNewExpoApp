/*
  # Fix orders RLS admin SELECT policy

  ## Problem
  The "Users can view own orders" policy uses `auth.jwt() ->> 'role' = 'admin'` 
  to grant admin access. However, Supabase does not automatically embed the 
  profile role into the JWT, so admins cannot see orders belonging to other users.

  ## Fix
  Replace the JWT-based role check with a subquery against the profiles table,
  consistent with all other admin policies in the schema.
*/

DROP POLICY IF EXISTS "Users can view own orders" ON orders;

CREATE POLICY "Users can view own orders"
  ON orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

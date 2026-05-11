/*
  # Fix Riders RLS Policies

  ## Problem
  The riders SELECT policy does a subquery into the profiles table to check if
  the current user is an admin. However, this subquery itself is subject to
  profiles RLS, which uses `auth.jwt() ->> 'role'` — creating a potential
  deadlock or mismatch. The result is that admins cannot see any riders.

  ## Fix
  Replace the profiles-subquery approach on all riders policies with the same
  `auth.jwt() ->> 'role' = 'admin'` pattern that the profiles policies use.
  This avoids the cross-table RLS dependency entirely.
*/

DROP POLICY IF EXISTS "Admins can select riders" ON riders;
DROP POLICY IF EXISTS "Admins can insert riders" ON riders;
DROP POLICY IF EXISTS "Admins can update riders" ON riders;
DROP POLICY IF EXISTS "Admins can delete riders" ON riders;

CREATE POLICY "Admins can select riders"
  ON riders FOR SELECT
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can insert riders"
  ON riders FOR INSERT
  TO authenticated
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can update riders"
  ON riders FOR UPDATE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() ->> 'role') = 'admin');

CREATE POLICY "Admins can delete riders"
  ON riders FOR DELETE
  TO authenticated
  USING ((auth.jwt() ->> 'role') = 'admin');

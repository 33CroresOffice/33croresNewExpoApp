/*
  # Create helper function to look up auth users by email

  Adds a security-definer function that edge functions can call via RPC
  to find an existing auth.users row by email address.
*/

CREATE OR REPLACE FUNCTION get_auth_user_by_email(p_email text)
RETURNS TABLE(id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT id, email FROM auth.users WHERE email = p_email LIMIT 1;
$$;

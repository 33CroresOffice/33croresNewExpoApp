/*
  # Create get_auth_user_by_id function

  Adds a secure RPC function that allows edge functions (via service role)
  to look up an auth user's email and id by their UUID. Used by verify-otp
  to find the canonical auth account for a profile when multiple auth accounts
  exist for the same mobile number (e.g. @customers.internal vs @petal.app).
*/

CREATE OR REPLACE FUNCTION get_auth_user_by_id(p_id uuid)
RETURNS TABLE(id uuid, email text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT au.id, au.email::text
  FROM auth.users au
  WHERE au.id = p_id;
END;
$$;

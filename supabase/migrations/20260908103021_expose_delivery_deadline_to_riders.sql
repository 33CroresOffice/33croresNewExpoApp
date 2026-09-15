/*
# Expose shared delivery deadline to riders

1. Changes
- Add a read-only function returning the single shared delivery deadline.
2. Security
- Only signed-in users can execute it.
- The function exposes only the time value, not admin settings.
*/

CREATE OR REPLACE FUNCTION get_delivery_deadline_time()
RETURNS time
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT delivery_deadline_time FROM auto_assignment_settings WHERE id = 1;
$$;

REVOKE EXECUTE ON FUNCTION get_delivery_deadline_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_delivery_deadline_time() TO authenticated;

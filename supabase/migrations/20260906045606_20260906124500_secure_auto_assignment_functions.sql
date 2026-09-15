/* Lock privileged assignment functions to authenticated callers and a fixed schema. */

ALTER FUNCTION auto_assign_riders(date) SET search_path = public;
ALTER FUNCTION redistribute_planned_leave(date) SET search_path = public;
ALTER FUNCTION redistribute_no_shows(date) SET search_path = public;
ALTER FUNCTION calculate_delivery_route(uuid, date) SET search_path = public;

REVOKE EXECUTE ON FUNCTION auto_assign_riders(date) FROM anon;
REVOKE EXECUTE ON FUNCTION redistribute_planned_leave(date) FROM anon;
REVOKE EXECUTE ON FUNCTION redistribute_no_shows(date) FROM anon;
REVOKE EXECUTE ON FUNCTION calculate_delivery_route(uuid, date) FROM anon;

GRANT EXECUTE ON FUNCTION auto_assign_riders(date) TO authenticated;
GRANT EXECUTE ON FUNCTION redistribute_planned_leave(date) TO authenticated;
GRANT EXECUTE ON FUNCTION redistribute_no_shows(date) TO authenticated;
GRANT EXECUTE ON FUNCTION calculate_delivery_route(uuid, date) TO authenticated;
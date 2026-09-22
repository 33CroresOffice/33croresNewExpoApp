/*
# Drop the superseded manual_reassign_orders overload

The temporary-reassign migration created a new 5-argument version of
manual_reassign_orders (p_assignment_ids, p_new_rider_id, p_reason, p_start_date,
p_end_date) but the old 3-argument version was left behind. Having both overloads
can make PostgREST resolve RPC calls ambiguously. This migration drops the old
3-argument overload; the new version covers it via defaults (start/end date are
optional, so old callers behave identically). No data is touched.
*/

DROP FUNCTION IF EXISTS manual_reassign_orders(uuid[], uuid, text);
-- Make rider_can_view_pickup_order_items SECURITY DEFINER to avoid RLS recursion
-- when called from the procurement_order_items UPDATE policy
ALTER FUNCTION rider_can_view_pickup_order_items(p_procurement_order_id uuid)
  SECURITY DEFINER
  SET search_path = public;

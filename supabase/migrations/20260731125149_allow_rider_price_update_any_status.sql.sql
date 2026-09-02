-- Allow riders assigned to procurement orders of any status to update prices
-- (previously restricted to status = 'accepted' only)
CREATE OR REPLACE FUNCTION rider_is_pickup_rider(p_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM procurement_orders po
    JOIN riders r ON r.id = po.pickup_rider_id
    WHERE po.id = p_order_id
      AND r.profile_id = auth.uid()
  );
$$;

/*
# Split pickup cutoff into order pickup and flower pickup

1. Changes
- Add `flower_pickup_cutoff_time` (time, nullable) to `auto_assignment_settings`.
  This is the latest time riders can pick up flowers (procurement orders) from vendors.
  The existing `pickup_cutoff_time` now means the latest time riders can pick up
  customer orders (subscription/custom) from the warehouse before delivery.
- Add `get_flower_pickup_cutoff_time()` SQL function returning the flower pickup cutoff.
  Mirrors the existing `get_pickup_cutoff_time()` function.
- Update `enforce_rider_pickup_cutoff()` trigger to check `flower_pickup_cutoff_time`
  instead of `pickup_cutoff_time`, since the trigger is on `procurement_orders`
  (flower/vendor pickups), not customer order pickups.

2. Security
- `get_flower_pickup_cutoff_time()` is SECURITY DEFINER, executable by authenticated users only.
- The trigger remains SECURITY DEFINER.
- Existing admin policies on `auto_assignment_settings` protect all columns.

3. Important Notes
- `pickup_cutoff_time` (order pickup) and `flower_pickup_cutoff_time` (flower pickup)
  are now independent. Admins can set different cutoff times for each pickup type.
- The trigger on `procurement_orders` now enforces the flower pickup cutoff.
- Customer order pickups (rider_order_assignments) have no DB-level trigger;
  the cutoff is enforced client-side in the rider assignments screen.
- Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE.
*/

ALTER TABLE auto_assignment_settings
  ADD COLUMN IF NOT EXISTS flower_pickup_cutoff_time time;

CREATE OR REPLACE FUNCTION get_flower_pickup_cutoff_time()
RETURNS time
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT flower_pickup_cutoff_time FROM auto_assignment_settings WHERE id = 1;
$$;

REVOKE EXECUTE ON FUNCTION get_flower_pickup_cutoff_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_flower_pickup_cutoff_time() TO authenticated;

-- Update the procurement_orders trigger to use the flower-specific cutoff
CREATE OR REPLACE FUNCTION enforce_rider_pickup_cutoff()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff time;
BEGIN
  IF NEW.status = 'fulfilled' AND COALESCE(OLD.status <> 'fulfilled', true)
     AND COALESCE((auth.jwt() ->> 'role') <> 'admin', true) THEN
    SELECT flower_pickup_cutoff_time
      INTO v_cutoff
      FROM auto_assignment_settings
     WHERE id = 1;

    IF v_cutoff IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Kolkata')::time > v_cutoff THEN
      RAISE EXCEPTION 'Flower pickup cutoff has passed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

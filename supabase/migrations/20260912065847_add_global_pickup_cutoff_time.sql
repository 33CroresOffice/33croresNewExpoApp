/*
# Add global pickup cutoff time

1. Changes
- Add `pickup_cutoff_time` (time, nullable) to the existing single-row `auto_assignment_settings` table.
  This is a shared latest pickup time for all riders, interpreted in Asia/Kolkata time.
  NULL means no pickup cutoff.
- Add `get_pickup_cutoff_time()` SQL function returning the shared cutoff so the rider app can read it.
  Mirrors the existing `get_delivery_deadline_time()` function.
- Add `enforce_rider_pickup_cutoff()` trigger on `procurement_orders` that blocks a rider from
  marking a procurement order as fulfilled (picked up) after the cutoff has passed.
  Admins (role = admin in JWT) bypass the check so they can still manage orders manually.
2. Security
- `get_pickup_cutoff_time()` is SECURITY DEFINER, executable by authenticated users only.
- The trigger is SECURITY DEFINER so it can read the shared setting regardless of the caller.
- Existing admin policies on `auto_assignment_settings` continue to protect the value.
3. Important Notes
- The cutoff is compared against current Asia/Kolkata time.
- Only the transition INTO 'fulfilled' is blocked; admins are exempt.
- Idempotent: uses IF NOT EXISTS / CREATE OR REPLACE.
*/

ALTER TABLE auto_assignment_settings
  ADD COLUMN IF NOT EXISTS pickup_cutoff_time time;

CREATE OR REPLACE FUNCTION get_pickup_cutoff_time()
RETURNS time
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pickup_cutoff_time FROM auto_assignment_settings WHERE id = 1;
$$;

REVOKE EXECUTE ON FUNCTION get_pickup_cutoff_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_pickup_cutoff_time() TO authenticated;

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
    SELECT pickup_cutoff_time
      INTO v_cutoff
      FROM auto_assignment_settings
     WHERE id = 1;

    IF v_cutoff IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Kolkata')::time > v_cutoff THEN
      RAISE EXCEPTION 'Pickup cutoff has passed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_rider_pickup_cutoff_on_fulfill ON procurement_orders;
CREATE TRIGGER enforce_rider_pickup_cutoff_on_fulfill
  BEFORE UPDATE ON procurement_orders
  FOR EACH ROW
  EXECUTE FUNCTION enforce_rider_pickup_cutoff();

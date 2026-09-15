/*
# Add Rider Delivery Time Limit

1. Changes
- Add `riders.delivery_deadline_time`, an optional daily cutoff time stored in IST.
- A NULL value means the rider has no cutoff.
2. Security
- Add a server-side trigger that blocks non-admin riders from marking an assignment delivered after their configured cutoff.
- Existing admin access remains unchanged; administrators can still mark deliveries complete.
3. Important Notes
- The cutoff is checked against Asia/Kolkata time.
- Existing riders and assignments remain valid because the new setting is nullable.
*/

ALTER TABLE riders
  ADD COLUMN IF NOT EXISTS delivery_deadline_time time;

CREATE OR REPLACE FUNCTION enforce_rider_delivery_deadline()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deadline time;
BEGIN
  IF NEW.status = 'delivered' AND OLD.status <> 'delivered'
     AND COALESCE((auth.jwt() ->> 'role') <> 'admin', true) THEN
    SELECT delivery_deadline_time
      INTO v_deadline
      FROM riders
     WHERE id = NEW.rider_id;

    IF v_deadline IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Kolkata')::time > v_deadline THEN
      RAISE EXCEPTION 'Delivery deadline has passed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_rider_delivery_deadline_on_deliver
  ON rider_order_assignments;

CREATE TRIGGER enforce_rider_delivery_deadline_on_deliver
  BEFORE UPDATE ON rider_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION enforce_rider_delivery_deadline();

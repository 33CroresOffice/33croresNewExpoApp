/*
# Make delivery time limit global

1. Changes
- Add `delivery_deadline_time` to the existing single-row `auto_assignment_settings` table.
- This one time limit applies to every rider.
2. Security
- The delivery trigger reads the shared setting server-side before accepting a rider delivery.
- Existing admin policies on the settings table continue to protect the value.
3. Important Notes
- NULL means there is no delivery cutoff.
- The time is interpreted in Asia/Kolkata time.
- Existing per-rider values remain in place for compatibility but are no longer used.
*/

ALTER TABLE auto_assignment_settings
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
      FROM auto_assignment_settings
     WHERE id = 1;

    IF v_deadline IS NOT NULL
       AND (now() AT TIME ZONE 'Asia/Kolkata')::time > v_deadline THEN
      RAISE EXCEPTION 'Delivery deadline has passed' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

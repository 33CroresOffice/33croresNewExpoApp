/*
# Location-based delivery verification for rider deliveries

1. New setting
- `auto_assignment_settings.delivery_radius_meters` (integer, default 200):
  the maximum distance in meters a rider's GPS position may be from the
  customer's delivery address when marking an order Delivered.

2. New trigger
- `verify_delivery_location()` on `rider_order_assignments` (BEFORE UPDATE,
  fires only when status changes to 'delivered'):
  * Requires delivery_latitude / delivery_longitude to be present.
  * Resolves the customer's delivery address coordinates:
      - custom assignments: custom_orders.address_id -> addresses
      - subscription assignments: orders -> subscriptions.delivery_address_id -> addresses
  * If the address has no saved coordinates, or no radius is configured,
    delivery proceeds unchanged (existing behaviour preserved).
  * Otherwise computes the haversine distance and rejects the update with a
    descriptive error when the rider is outside the permitted radius.
- Does not modify any cron job, schedule, activation state, or history.

3. New helper
- `get_delivery_radius_meters()`: read-only accessor so the rider app can
  show the configured radius in its error message. SECURITY DEFINER with a
  pinned search_path, EXECUTE for authenticated only.

4. Security
- Trigger functions run as definer; no new grants on tables.
- `get_delivery_radius_meters()` revoked from PUBLIC/anon, granted to
  authenticated.
*/

ALTER TABLE auto_assignment_settings
  ADD COLUMN IF NOT EXISTS delivery_radius_meters integer;

UPDATE auto_assignment_settings
   SET delivery_radius_meters = 200
 WHERE delivery_radius_meters IS NULL;

ALTER TABLE auto_assignment_settings
  ALTER COLUMN delivery_radius_meters SET DEFAULT 200,
  ALTER COLUMN delivery_radius_meters SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auto_assignment_settings_radius_check'
  ) THEN
    ALTER TABLE auto_assignment_settings
      ADD CONSTRAINT auto_assignment_settings_radius_check
      CHECK (delivery_radius_meters >= 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION verify_delivery_location()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_radius integer;
  v_addr_lat double precision;
  v_addr_lng double precision;
  v_distance_m double precision;
BEGIN
  IF NEW.status <> 'delivered' OR OLD.status = 'delivered' THEN
    RETURN NEW;
  END IF;

  IF NEW.delivery_latitude IS NULL OR NEW.delivery_longitude IS NULL THEN
    RAISE EXCEPTION 'GPS location is required to mark a delivery'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT delivery_radius_meters INTO v_radius
    FROM auto_assignment_settings WHERE id = 1;

  IF v_radius IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.custom_order_id IS NOT NULL THEN
    SELECT a.latitude, a.longitude
      INTO v_addr_lat, v_addr_lng
      FROM custom_orders co
      JOIN addresses a ON a.id = co.address_id
     WHERE co.id = NEW.custom_order_id;
  ELSE
    SELECT a.latitude, a.longitude
      INTO v_addr_lat, v_addr_lng
      FROM orders o
      JOIN subscriptions s ON s.id = o.subscription_id
      JOIN addresses a ON a.id = s.delivery_address_id
     WHERE o.id = NEW.order_id;
  END IF;

  IF v_addr_lat IS NULL OR v_addr_lng IS NULL THEN
    RETURN NEW;
  END IF;

  v_distance_m := 6371000 * acos(least(1.0,
    cos(radians(v_addr_lat)) * cos(radians(NEW.delivery_latitude)) *
    cos(radians(NEW.delivery_longitude) - radians(v_addr_lng)) +
    sin(radians(v_addr_lat)) * sin(radians(NEW.delivery_latitude))));

  IF v_distance_m > v_radius THEN
    RAISE EXCEPTION 'You are % meters from the delivery address, outside the permitted % meter radius. Move closer to the customer address and try again.',
      ceil(v_distance_m)::int, v_radius
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verify_delivery_location ON rider_order_assignments;
CREATE TRIGGER trg_verify_delivery_location
  BEFORE UPDATE ON rider_order_assignments
  FOR EACH ROW
  EXECUTE FUNCTION verify_delivery_location();

CREATE OR REPLACE FUNCTION get_delivery_radius_meters()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT delivery_radius_meters FROM auto_assignment_settings WHERE id = 1;
$$;

REVOKE EXECUTE ON FUNCTION get_delivery_radius_meters() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_delivery_radius_meters() TO authenticated;

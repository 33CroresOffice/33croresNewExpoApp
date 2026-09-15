/*
# Add Arrival OTP to Pandit Booking Flow

1. Purpose
- When the Pandit clicks "Arrived", a 6-digit OTP is generated and shown to the customer on their Pooja booking details page.
- The customer shares the OTP verbally with the Pandit.
- The Pandit enters the OTP in the app. Only after successful verification is the "Start Pooja" button enabled.

2. Schema Changes
- `provider_bookings` table:
  - `arrival_otp` (text, nullable): stores the 6-digit OTP generated when the Pandit arrives.
  - `arrival_otp_verified` (boolean, default false): set to true when the Pandit successfully verifies the OTP.
  - `arrival_otp_generated_at` (timestamptz, nullable): when the OTP was generated (for expiry, 30 min).

3. RPC Changes
- `pandit_arrived(p_booking_id)`: now generates a random 6-digit OTP, stores it, and sends a notification to the customer with the OTP.
- `verify_arrival_otp(p_booking_id, p_otp)`: called by the Pandit. Verifies the OTP matches and is not expired (30 min). Sets `arrival_otp_verified = true`. Returns success/failure.
- `start_pooja(p_booking_id)`: now requires `arrival_otp_verified = true` before allowing transition to `pooja_in_progress`.

4. Security
- All RPCs are SECURITY DEFINER with fixed search_path = public.
- `pandit_arrived` and `verify_arrival_otp` verify the caller is the booking's provider.
- `start_pooja` verifies the caller is the provider AND that OTP has been verified.
- No new tables. No RLS policy changes needed (existing policies already allow provider and customer to SELECT their bookings).

5. Data Safety
- No destructive operations. Only adds nullable columns and modifies existing RPCs.
- Existing bookings without OTP data are unaffected (arrival_otp_verified defaults to false, but start_pooja only applies to bookings in pandit_arrived state which are new).
*/

-- 1. Add OTP columns to provider_bookings
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='provider_bookings' AND column_name='arrival_otp'
  ) THEN
    ALTER TABLE provider_bookings ADD COLUMN arrival_otp text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='provider_bookings' AND column_name='arrival_otp_verified'
  ) THEN
    ALTER TABLE provider_bookings ADD COLUMN arrival_otp_verified boolean NOT NULL DEFAULT false;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='provider_bookings' AND column_name='arrival_otp_generated_at'
  ) THEN
    ALTER TABLE provider_bookings ADD COLUMN arrival_otp_generated_at timestamptz;
  END IF;
END $$;

-- 2. Update pandit_arrived to generate OTP and notify customer
CREATE OR REPLACE FUNCTION pandit_arrived(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_provider_user_id uuid;
  v_otp text;
BEGIN
  SELECT * INTO v_booking FROM provider_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status <> 'pandit_on_the_way' THEN RAISE EXCEPTION 'Pandit must be on the way first'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  -- Generate 6-digit OTP
  v_otp := lpad(floor(random() * 1000000)::text, 6, '0');

  UPDATE provider_bookings
  SET status = 'pandit_arrived',
      arrival_otp = v_otp,
      arrival_otp_verified = false,
      arrival_otp_generated_at = now(),
      updated_at = now()
  WHERE id = p_booking_id;

  -- Notify customer: pandit arrived + show OTP
  PERFORM send_booking_notification(
    p_booking_id,
    v_booking.customer_id,
    'booking_pandit_arrived',
    'Pandit Arrived',
    'Your Pandit has arrived at the location. Your OTP is ' || v_otp || '. Please share it with the Pandit to start the Pooja.'
  );
END;
$$;
REVOKE ALL ON FUNCTION pandit_arrived(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pandit_arrived(uuid) TO authenticated;

-- 3. New RPC: verify_arrival_otp (called by Pandit)
CREATE OR REPLACE FUNCTION verify_arrival_otp(
  p_booking_id uuid,
  p_otp text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_provider_user_id uuid;
BEGIN
  SELECT * INTO v_booking FROM provider_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF v_booking.status <> 'pandit_arrived' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Booking is not in arrived state');
  END IF;

  IF v_booking.arrival_otp_verified THEN
    RETURN jsonb_build_object('success', true, 'already_verified', true);
  END IF;

  IF v_booking.arrival_otp IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No OTP has been generated');
  END IF;

  -- OTP expires after 30 minutes
  IF v_booking.arrival_otp_generated_at IS NULL OR now() - v_booking.arrival_otp_generated_at > interval '30 minutes' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OTP has expired. Please ask the customer to refresh.');
  END IF;

  IF trim(p_otp) <> v_booking.arrival_otp THEN
    RETURN jsonb_build_object('success', false, 'error', 'Incorrect OTP');
  END IF;

  UPDATE provider_bookings
  SET arrival_otp_verified = true,
      updated_at = now()
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE ALL ON FUNCTION verify_arrival_otp(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_arrival_otp(uuid, text) TO authenticated;

-- 4. Update start_pooja to require OTP verification
CREATE OR REPLACE FUNCTION start_pooja(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_provider_user_id uuid;
BEGIN
  SELECT * INTO v_booking FROM provider_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status <> 'pandit_arrived' THEN RAISE EXCEPTION 'Pandit must arrive first'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  IF NOT v_booking.arrival_otp_verified THEN
    RAISE EXCEPTION 'OTP verification is required before starting the Pooja';
  END IF;

  UPDATE provider_bookings SET status = 'pooja_in_progress', updated_at = now() WHERE id = p_booking_id;

  PERFORM send_booking_notification(p_booking_id, v_booking.customer_id, 'booking_pooja_started', 'Pooja Started', 'Your Pooja has started.');
END;
$$;
REVOKE ALL ON FUNCTION start_pooja(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_pooja(uuid) TO authenticated;

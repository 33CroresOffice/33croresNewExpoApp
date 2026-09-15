/*
# Send push notification on Pandit arrival with OTP

Updates pandit_arrived() to also fire an Expo push notification (via pg_net)
in addition to the existing in-app notification.
*/

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
  v_push_token text;
  v_title text;
  v_body text;
BEGIN
  SELECT * INTO v_booking FROM provider_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status <> 'pandit_on_the_way' THEN RAISE EXCEPTION 'Pandit must be on the way first'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  v_otp := lpad(floor(random() * 1000000)::text, 6, '0');

  UPDATE provider_bookings
  SET status = 'pandit_arrived',
      arrival_otp = v_otp,
      arrival_otp_verified = false,
      arrival_otp_generated_at = now(),
      updated_at = now()
  WHERE id = p_booking_id;

  v_title := 'Pandit Arrived';
  v_body := 'Your Pandit has arrived at the location. Your OTP is ' || v_otp || '. Please share it with the Pandit to start the Pooja.';

  -- In-app notification (existing behaviour)
  PERFORM send_booking_notification(
    p_booking_id,
    v_booking.customer_id,
    'booking_pandit_arrived',
    v_title,
    v_body
  );

  -- Push notification via Expo (best-effort, async)
  SELECT token INTO v_push_token FROM expo_push_tokens WHERE user_id = v_booking.customer_id;
  IF v_push_token IS NOT NULL THEN
    PERFORM net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := jsonb_build_object(
        'to', v_push_token,
        'sound', 'default',
        'title', v_title,
        'body', v_body,
        'data', jsonb_build_object('screen', 'service-order-details', 'bookingId', p_booking_id)
      )
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION pandit_arrived(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pandit_arrived(uuid) TO authenticated;

/*
# Pandit Booking Status Flow - Part 2: State Machine RPCs

1. Helper: send_booking_notification (in_app + dedup)
2. accept_provider_booking (request_sent -> awaiting_advance_payment)
3. decline_provider_booking (request_sent -> declined)
4. cancel_provider_booking (customer cancel)
5. start_pandit_travel (booking_confirmed -> pandit_on_the_way)
6. pandit_arrived (pandit_on_the_way -> pandit_arrived)
7. start_pooja (pandit_arrived -> pooja_in_progress)
8. complete_pooja (pooja_in_progress -> pooja_completed)
9. settle_booking (payment_completed -> settled, admin only)
10. Update create_pooja_booking and create_provider_booking to use request_sent + notify
*/

-- 1. Helper: send booking notification (in_app with dedup)
CREATE OR REPLACE FUNCTION send_booking_notification(
  p_booking_id uuid,
  p_user_id uuid,
  p_event_type text,
  p_title text,
  p_body text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM in_app_notifications
    WHERE user_id = p_user_id
      AND event_type = p_event_type
      AND related_booking_id = p_booking_id
  ) THEN
    INSERT INTO in_app_notifications (user_id, title, body, event_type, related_booking_id, is_read, read_at)
    VALUES (p_user_id, p_title, p_body, p_event_type, p_booking_id, false, null);
  END IF;

  INSERT INTO notification_logs (user_id, event_type, channel, rendered_subject, rendered_body, triggered_by)
  VALUES (p_user_id, p_event_type, 'in_app', p_title, p_body, 'system');
END;
$$;
REVOKE ALL ON FUNCTION send_booking_notification(uuid, uuid, text, text, text) FROM PUBLIC;

-- 2. Accept booking: request_sent -> awaiting_advance_payment (by provider)
CREATE OR REPLACE FUNCTION accept_provider_booking(p_booking_id uuid)
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
  IF v_booking.status <> 'request_sent' THEN RAISE EXCEPTION 'Booking is not in request_sent state'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE provider_bookings SET status = 'awaiting_advance_payment', updated_at = now() WHERE id = p_booking_id;

  PERFORM send_booking_notification(p_booking_id, v_booking.customer_id, 'booking_pandit_accepted', 'Booking Request Accepted', 'Your booking request has been accepted by the Pandit.');
  PERFORM send_booking_notification(p_booking_id, v_booking.customer_id, 'booking_awaiting_advance', 'Advance Payment Required', 'Please complete the advance payment to confirm your booking.');
END;
$$;
REVOKE ALL ON FUNCTION accept_provider_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION accept_provider_booking(uuid) TO authenticated;

-- 3. Decline booking: request_sent -> declined (by provider)
CREATE OR REPLACE FUNCTION decline_provider_booking(p_booking_id uuid)
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
  IF v_booking.status <> 'request_sent' THEN RAISE EXCEPTION 'Booking is not in request_sent state'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE provider_bookings SET status = 'declined', updated_at = now() WHERE id = p_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION decline_provider_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION decline_provider_booking(uuid) TO authenticated;

-- 4. Cancel booking: customer can cancel from request_sent or awaiting_advance_payment
CREATE OR REPLACE FUNCTION cancel_provider_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
BEGIN
  SELECT * INTO v_booking FROM provider_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.customer_id <> auth.uid() THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF v_booking.status NOT IN ('request_sent', 'awaiting_advance_payment') THEN RAISE EXCEPTION 'Booking cannot be cancelled at this stage'; END IF;

  UPDATE provider_bookings SET status = 'cancelled', updated_at = now() WHERE id = p_booking_id;
END;
$$;
REVOKE ALL ON FUNCTION cancel_provider_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cancel_provider_booking(uuid) TO authenticated;

-- 5. Pandit starts travel: booking_confirmed -> pandit_on_the_way (by provider)
CREATE OR REPLACE FUNCTION start_pandit_travel(p_booking_id uuid)
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
  IF v_booking.status <> 'booking_confirmed' THEN RAISE EXCEPTION 'Booking must be confirmed first'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE provider_bookings SET status = 'pandit_on_the_way', updated_at = now() WHERE id = p_booking_id;

  PERFORM send_booking_notification(p_booking_id, v_booking.customer_id, 'booking_pandit_on_the_way', 'Pandit On The Way', 'Your Pandit is on the way.');
END;
$$;
REVOKE ALL ON FUNCTION start_pandit_travel(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_pandit_travel(uuid) TO authenticated;

-- 6. Pandit arrived: pandit_on_the_way -> pandit_arrived (by provider)
CREATE OR REPLACE FUNCTION pandit_arrived(p_booking_id uuid)
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
  IF v_booking.status <> 'pandit_on_the_way' THEN RAISE EXCEPTION 'Pandit must be on the way first'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE provider_bookings SET status = 'pandit_arrived', updated_at = now() WHERE id = p_booking_id;

  PERFORM send_booking_notification(p_booking_id, v_booking.customer_id, 'booking_pandit_arrived', 'Pandit Arrived', 'Your Pandit has arrived at the location.');
END;
$$;
REVOKE ALL ON FUNCTION pandit_arrived(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pandit_arrived(uuid) TO authenticated;

-- 7. Start pooja: pandit_arrived -> pooja_in_progress (by provider)
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

  UPDATE provider_bookings SET status = 'pooja_in_progress', updated_at = now() WHERE id = p_booking_id;

  PERFORM send_booking_notification(p_booking_id, v_booking.customer_id, 'booking_pooja_started', 'Pooja Started', 'Your Pooja has started.');
END;
$$;
REVOKE ALL ON FUNCTION start_pooja(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION start_pooja(uuid) TO authenticated;

-- 8. Complete pooja: pooja_in_progress -> pooja_completed (by provider)
CREATE OR REPLACE FUNCTION complete_pooja(p_booking_id uuid)
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
  IF v_booking.status <> 'pooja_in_progress' THEN RAISE EXCEPTION 'Pooja must be in progress first'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;
  IF auth.uid() IS DISTINCT FROM v_provider_user_id THEN RAISE EXCEPTION 'Not authorized'; END IF;

  UPDATE provider_bookings SET status = 'pooja_completed', updated_at = now() WHERE id = p_booking_id;

  PERFORM send_booking_notification(p_booking_id, v_booking.customer_id, 'booking_pooja_completed', 'Pooja Completed', 'Your Pooja has been completed. Please complete the remaining payment.');
END;
$$;
REVOKE ALL ON FUNCTION complete_pooja(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION complete_pooja(uuid) TO authenticated;

-- 9. Settle booking: payment_completed -> settled (admin only)
CREATE OR REPLACE FUNCTION settle_booking(p_booking_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking RECORD;
  v_provider_user_id uuid;
BEGIN
  IF (auth.jwt() -> 'app_metadata' ->> 'role') <> 'admin' THEN RAISE EXCEPTION 'Not authorized'; END IF;

  SELECT * INTO v_booking FROM provider_bookings WHERE id = p_booking_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking not found'; END IF;
  IF v_booking.status <> 'payment_completed' THEN RAISE EXCEPTION 'Payment must be completed first'; END IF;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = v_booking.provider_id;

  UPDATE provider_bookings SET status = 'settled', updated_at = now() WHERE id = p_booking_id;

  PERFORM send_booking_notification(p_booking_id, v_provider_user_id, 'booking_settled', 'Payment Settled', 'The payment for this booking has been settled successfully.');
END;
$$;
REVOKE ALL ON FUNCTION settle_booking(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION settle_booking(uuid) TO authenticated;

-- 10. Update booking creation RPCs to use request_sent + send notification
CREATE OR REPLACE FUNCTION create_pooja_booking(
  p_provider_id uuid,
  p_pooja_setup_id uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_preferred_date date,
  p_preferred_time text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_total numeric(10,2);
  v_provider_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;

  SELECT pps.service_fee INTO v_total FROM service_providers sp JOIN provider_pooja_setups pps ON pps.provider_id=sp.id WHERE sp.id=p_provider_id AND pps.id=p_pooja_setup_id AND sp.approval_status='approved' AND sp.is_active AND sp.bookings_enabled AND pps.is_active;
  IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Pooja service is not available'; END IF;

  INSERT INTO provider_bookings(provider_id,pooja_setup_id,customer_id,customer_name,customer_mobile,preferred_date,preferred_time,consultation_mode,notes,total_amount,advance_amount,remaining_amount,status)
  VALUES(p_provider_id,p_pooja_setup_id,auth.uid(),trim(p_customer_name),trim(p_customer_mobile),p_preferred_date,trim(p_preferred_time),'in_person',p_notes,v_total,round(v_total * 0.30, 2),v_total-round(v_total * 0.30, 2),'request_sent')
  RETURNING id INTO v_id;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = p_provider_id;
  PERFORM send_booking_notification(v_id, v_provider_user_id, 'booking_request_sent', 'New Pooja Booking Request', 'You have received a new Pooja booking request.');

  RETURN v_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_pooja_booking(uuid,uuid,text,text,date,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_pooja_booking(uuid,uuid,text,text,date,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION create_provider_booking(
  p_provider_id uuid,
  p_service_id uuid,
  p_customer_name text,
  p_customer_mobile text,
  p_preferred_date date,
  p_preferred_time text,
  p_consultation_mode text,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_total numeric(10,2);
  v_provider_user_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_preferred_date < current_date THEN RAISE EXCEPTION 'Date must be in the future'; END IF;
  SELECT COALESCE(admin_override_price, price) INTO v_total FROM provider_services ps JOIN service_providers sp ON sp.id=ps.provider_id WHERE sp.id=p_provider_id AND ps.id=p_service_id AND sp.approval_status='approved' AND sp.is_active AND sp.bookings_enabled AND ps.is_active;
  IF v_total IS NULL THEN RAISE EXCEPTION 'Service is not available'; END IF;

  INSERT INTO provider_bookings(provider_id,service_id,customer_id,customer_name,customer_mobile,preferred_date,preferred_time,consultation_mode,notes,total_amount,advance_amount,remaining_amount,status)
  VALUES(p_provider_id,p_service_id,auth.uid(),trim(p_customer_name),trim(p_customer_mobile),p_preferred_date,trim(p_preferred_time),p_consultation_mode,trim(coalesce(p_notes,'')),v_total,round(v_total * 0.30, 2),v_total-round(v_total * 0.30, 2),'request_sent')
  RETURNING id INTO v_id;

  SELECT auth_user_id INTO v_provider_user_id FROM service_providers WHERE id = p_provider_id;
  PERFORM send_booking_notification(v_id, v_provider_user_id, 'booking_request_sent', 'New Pooja Booking Request', 'You have received a new Pooja booking request.');

  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION create_provider_booking(uuid,uuid,text,text,date,text,text,text) TO authenticated;
